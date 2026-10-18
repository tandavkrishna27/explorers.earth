#!/usr/bin/env bash
# Host side of .github/workflows/explorers.yml (P2 Task 7). Runs as root via sudo.
#
#   explorers-deploy.sh backup   <staging-dir>
#   explorers-deploy.sh stage    <staging-dir>
#   explorers-deploy.sh activate <staging-dir>
#
# <staging-dir> holds what the workflow uploaded: release.tar.gz (one top-level
# directory named for the commit), explorers.conf (the rendered nginx site),
# production.compose.yml, and deploy.env (IMAGE_NAME, IMAGE_DIGEST, COMMIT,
# NGINX_SITE_PATH, SERVER_NAME).
#
# stage:    unpack the release beside the live one; place the compose file; refuse
#           an image whose bundled migration chain is older than the database's;
#           compose pull + up --wait; gate on /health/ready; record the running
#           image in /opt/explorers/image.env. The SPA is untouched.
# activate: back up the live nginx site, swap /srv/explorers/current, install the
#           new site, nginx -t, reload. Any failure restores the previous site and
#           symlink before exiting non-zero.
#
# The API switches at `compose up`, before the workflow's acceptance checks run. On
# every deploy after the first there is a window where a broken API is live; the
# recovery is to redeploy the previous commit. P2 deliberately has no blue/green.
set -Eeuo pipefail

readonly SRV=/srv/explorers
readonly OPT=/opt/explorers
readonly ENV_FILE="$OPT/production.env"
readonly COMPOSE_FILE="$OPT/production.compose.yml"
readonly IMAGE_ENV="$OPT/image.env"
readonly READY_URL=http://127.0.0.1:5000/health/ready
readonly READY_TIMEOUT_SECONDS=180
readonly KEEP_RELEASES=5

fail() { echo "::error::$*" >&2; exit 1; }

[[ "$#" -eq 2 ]] || fail "usage: explorers-deploy.sh backup|stage|activate <staging-dir>"
phase="$1"
staging="$2"
[[ "$(id -u)" -eq 0 ]] || fail "run as root (sudo)"
[[ -d "$staging" && -f "$staging/deploy.env" ]] || fail "staging directory $staging is incomplete"

# deploy.env is written by the workflow; validate every value rather than sourcing it.
read_value() {
  local name="$1" pattern="$2" value
  value="$(sed -n "s/^${name}=//p" "$staging/deploy.env")"
  [[ "$value" =~ $pattern ]] || fail "deploy.env: $name is missing or malformed"
  printf '%s' "$value"
}
IMAGE_NAME="$(read_value IMAGE_NAME '^ghcr\.io/[a-z0-9._-]+/explorers-tunes$')"
IMAGE_DIGEST="$(read_value IMAGE_DIGEST '^sha256:[a-f0-9]{64}$')"
COMMIT="$(read_value COMMIT '^[a-f0-9]{40}$')"
NGINX_SITE_PATH="$(read_value NGINX_SITE_PATH '^/etc/nginx/[A-Za-z0-9._/-]+$')"
SERVER_NAME="$(read_value SERVER_NAME '^[A-Za-z0-9.-]+$')"
readonly IMAGE_NAME IMAGE_DIGEST COMMIT NGINX_SITE_PATH SERVER_NAME
readonly IMAGE="$IMAGE_NAME@$IMAGE_DIGEST"
readonly RELEASE="$SRV/releases/$COMMIT"

# The shell environment overrides --env-file, so the image is always the verified digest.
compose() {
  EXPLORERS_API_IMAGE_NAME="$IMAGE_NAME" EXPLORERS_API_DIGEST="$IMAGE_DIGEST" EXPLORERS_API_COMMIT="$COMMIT" \
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

compose_diagnostics() {
  compose ps || true
  compose logs --no-color --tail 200 migrate api || true
}

nginx_diagnostics() {
  systemctl status nginx --no-pager -l || true
  journalctl -u nginx -n 100 --no-pager || true
}

preflight() {
  command -v docker >/dev/null || fail "docker is not installed"
  docker compose version >/dev/null || fail "docker compose v2 is not available"
  command -v nginx >/dev/null || fail "nginx is not installed"
  command -v curl >/dev/null || fail "curl is not installed"
  [[ -f "$ENV_FILE" && ! -L "$ENV_FILE" ]] || fail "$ENV_FILE is missing (P2 Task 9 Step 3)"
  [[ "$(stat -c '%u %a' "$ENV_FILE")" == "0 600" ]] || fail "$ENV_FILE must be root-owned mode 0600"
}

migration_rank() { local id="$1"; printf '%d' "$((10#${id%%_*}))"; }

# backup: before anything migrates, take the pre-deploy backup bound to the
# candidate's identity (docs/replatform/release-and-recovery.md). There is no
# rollback below the migration floor, only restore-forward, so this backup is what
# makes a bad migration survivable. A host whose canonical database has never been
# migrated has nothing to protect and says so in $staging/backup-result - only the
# host can decide that. A database volume that exists while postgres is down is
# refused: it cannot be backed up.
backup() {
  preflight
  [[ -f "$staging/platform-backup.mjs" ]] || fail "staging is missing platform-backup.mjs"
  install -d -m 0700 "$OPT"
  install -m 0700 "$staging/platform-backup.mjs" "$OPT/platform-backup.mjs"
  rm -f "$staging/backup-result" "$staging/backup-manifest.json"
  local running volume db_head=""
  running="$(docker ps -q --filter label=com.docker.compose.project=explorers-canonical --filter label=com.docker.compose.service=postgres)"
  volume="$(docker volume ls -q --filter label=com.docker.compose.project=explorers-canonical --filter label=com.docker.compose.volume=postgres-data)"
  if [[ -z "$running" && -n "$volume" ]]; then
    fail "the explorers-canonical postgres-data volume exists but postgres is not running; refusing to deploy without a backup"
  fi
  if [[ -n "$running" ]]; then
    db_head="$(docker exec -i "$running" sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA' <<'SQL'
SELECT CASE WHEN to_regclass('music_schema_migrations') IS NULL THEN ''
            ELSE (SELECT coalesce(max(id), '') FROM music_schema_migrations) END;
SQL
)" || fail "could not read the database migration journal"
    db_head="$(printf '%s' "$db_head" | tr -d '[:space:]')"
  fi
  if [[ -z "$db_head" ]]; then
    echo "no migrated canonical database on this host yet; nothing to back up"
    printf 'fresh\n' > "$staging/backup-result"
  else
    command -v node >/dev/null || fail "node is not installed; the pre-deploy backup needs it"
    node "$OPT/platform-backup.mjs" --environment prod --reason pre-deploy \
      --candidate-digest "$IMAGE_DIGEST" --candidate-commit "$COMMIT" --output-manifest "$staging/backup-manifest.json" \
      || fail "the pre-deploy backup failed; nothing was deployed"
    printf 'backed-up\n' > "$staging/backup-result"
  fi
  # The workflow fetches these back as the deploy user, which owns the staging directory.
  chown --reference="$staging" "$staging/backup-result"
  [[ ! -f "$staging/backup-manifest.json" ]] || chown --reference="$staging" "$staging/backup-manifest.json"
}

stage() {
  preflight
  [[ -f "$staging/release.tar.gz" && -f "$staging/production.compose.yml" ]] || fail "staging is missing the release or compose file"

  # 1. The release, beside the live one. A commit already live is left as it is.
  install -d -m 0755 "$SRV" "$SRV/releases"
  local current_target=""
  [[ -L "$SRV/current" ]] && current_target="$(readlink -f "$SRV/current")"
  if [[ "$current_target" == "$RELEASE" ]]; then
    echo "release $COMMIT is already live; keeping it"
  else
    local incoming="$SRV/releases/.incoming-$COMMIT"
    rm -rf "$incoming" && install -d -m 0755 "$incoming"
    tar -xzf "$staging/release.tar.gz" -C "$incoming" --no-same-owner
    [[ -f "$incoming/$COMMIT/dist/index.html" && -f "$incoming/$COMMIT/dist/runtime-config.json" \
      && -f "$incoming/$COMMIT/runtime/headers.conf" && ! -e "$incoming/$COMMIT/dist/headers.conf" ]] \
      || fail "uploaded release does not have the dist/ + runtime/headers.conf layout"
    rm -rf "$RELEASE"
    mv "$incoming/$COMMIT" "$RELEASE"
    rmdir "$incoming"
  fi

  # 2. The compose file, keeping the previous copy.
  install -d -m 0700 "$OPT"
  local had_previous=0
  [[ -f "$COMPOSE_FILE" ]] && cp -p "$COMPOSE_FILE" "$COMPOSE_FILE.previous" && had_previous=1
  install -m 0600 "$staging/production.compose.yml" "$COMPOSE_FILE"
  # Until step 5 starts the new image, a refusal must leave the compose file that
  # matches what is running; otherwise the next `compose up` pairs the running
  # image with another release's migration marker and the gate refuses it.
  refuse() {
    if (( had_previous )); then cp -p "$COMPOSE_FILE.previous" "$COMPOSE_FILE"; else rm -f "$COMPOSE_FILE"; fi
    fail "$*; $COMPOSE_FILE left as it was"
  }
  compose config --quiet || refuse "compose refused to render; check $ENV_FILE against deploy/production.env.example"

  # 3. The verified image, and the migration chain it bundles.
  compose pull || refuse "could not pull $IMAGE"
  local revision
  revision="$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$IMAGE")"
  [[ "$revision" == "$COMMIT" ]] || refuse "image revision label is '$revision', expected $COMMIT"
  local image_head
  image_head="$(docker run --rm --network none --entrypoint sh "$IMAGE" -c 'ls /app/migrations' | grep -E '^[0-9]{4}_[a-z0-9_]+\.sql$' | sort | tail -n 1)"
  image_head="${image_head%.sql}"
  [[ -n "$image_head" ]] || refuse "could not read the image's bundled migration chain"

  # 4. Refuse an image older than the database. Without this an older image pulls,
  #    starts, and crash-loops in verifyMusicDatabase (music-deploy-engine.sh used to
  #    refuse it; that engine does not run here).
  compose up -d --wait postgres || { compose_diagnostics; refuse "postgres did not become healthy"; }
  # Two queries, not one CASE: PostgreSQL resolves every table a statement names
  # before running it, so a CASE that only reads the journal when it exists still
  # fails on a fresh database with 'relation does not exist'.
  local db_head="" journal_exists
  journal_exists="$(compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA' <<'SQL'
SELECT to_regclass('public.music_schema_migrations') IS NOT NULL;
SQL
)" || refuse "could not query the database"
  if [[ "$(printf '%s' "$journal_exists" | tr -d '[:space:]')" == t ]]; then
    db_head="$(compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA' <<'SQL'
SELECT coalesce(max(id), '') FROM public.music_schema_migrations;
SQL
)" || refuse "could not read the database migration journal"
  fi
  db_head="$(printf '%s' "$db_head" | tr -d '[:space:]')"
  echo "image migration head: $image_head; database migration head: ${db_head:-<none, fresh database>}"
  if [[ -n "$db_head" ]]; then
    [[ "$db_head" =~ ^[0-9]{4}_[a-z0-9_]+$ ]] || refuse "database journal head '$db_head' is malformed"
    (( $(migration_rank "$image_head") >= $(migration_rank "$db_head") )) \
      || refuse "image bundles migrations up to $image_head but the database is at $db_head; refusing an older image"
  fi

  # 5. Migrate and start. --wait covers the container healthchecks only.
  compose up -d --wait || { compose_diagnostics; fail "compose up did not settle"; }

  # 6. Readiness, bounded.
  local deadline=$((SECONDS + READY_TIMEOUT_SECONDS)) code=""
  until code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$READY_URL")" && [[ "$code" == 200 ]]; do
    if (( SECONDS >= deadline )); then
      compose_diagnostics
      fail "$READY_URL did not answer 200 within ${READY_TIMEOUT_SECONDS}s (last: ${code:-no response})"
    fi
    sleep 3
  done
  echo "API ready: $IMAGE"

  # 7. Record what is running, so an operator's own compose commands (taxonomy
  #    apply, logs, exec) use the deployed image rather than production.env's
  #    placeholders: add `--env-file $IMAGE_ENV` after `--env-file $ENV_FILE`.
  install -m 0600 /dev/null "$IMAGE_ENV.next"
  printf 'EXPLORERS_API_IMAGE_NAME=%s\nEXPLORERS_API_DIGEST=%s\nEXPLORERS_API_COMMIT=%s\n' \
    "$IMAGE_NAME" "$IMAGE_DIGEST" "$COMMIT" > "$IMAGE_ENV.next"
  mv -f "$IMAGE_ENV.next" "$IMAGE_ENV"
  echo "recorded the running image in $IMAGE_ENV"

  # 8. EXPLORERS_TRUSTED_PROXY_IP must be the egress network's gateway, the address
  #    host nginx reaches the published port from. Anything else means the API
  #    trusts nobody and the whole internet shares one rate-limit bucket. Docker
  #    picks the subnet when the network is first created, so the first deploy can
  #    only warn; on any later deploy a mismatch means the network was recreated.
  local api_container gateway configured
  api_container="$(compose ps -q api)"
  gateway="$(docker inspect -f '{{with index .NetworkSettings.Networks "explorers-canonical_egress"}}{{.Gateway}}{{end}}' "$api_container")"
  configured="$(sed -n 's/^EXPLORERS_TRUSTED_PROXY_IP=//p' "$ENV_FILE" | tail -n 1)"
  if [[ "$gateway" != "$configured" ]]; then
    local advice="EXPLORERS_TRUSTED_PROXY_IP is '$configured' but nginx reaches the API from '$gateway'. Set it to $gateway in $ENV_FILE, then: docker compose -f $COMPOSE_FILE --env-file $ENV_FILE --env-file $IMAGE_ENV up -d api"
    if [[ -z "$db_head" ]]; then echo "::warning::first deploy: $advice"
    else compose_diagnostics; fail "$advice"; fi
  else
    echo "trusted proxy: $gateway (matches the egress gateway)"
  fi
}

activate() {
  preflight
  [[ -f "$staging/explorers.conf" ]] || fail "staging is missing the rendered nginx site"
  [[ -d "$RELEASE/dist" ]] || fail "release $COMMIT was not staged"

  local stamp backup="" previous=""
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  install -d -m 0700 "$SRV/nginx-backups"
  if [[ -e "$NGINX_SITE_PATH" ]]; then
    backup="$SRV/nginx-backups/$(basename "$NGINX_SITE_PATH").$stamp"
    cp -pL "$NGINX_SITE_PATH" "$backup"
    echo "backed up $NGINX_SITE_PATH to $backup"
  fi
  [[ -L "$SRV/current" ]] && previous="$(readlink "$SRV/current")"

  restore() {
    echo "restoring the previous nginx site and release" >&2
    if [[ -n "$backup" ]]; then cp -p "$backup" "$NGINX_SITE_PATH"; else rm -f "$NGINX_SITE_PATH"; fi
    if [[ -n "$previous" ]]; then ln -sfn "$previous" "$SRV/current.next" && mv -Tf "$SRV/current.next" "$SRV/current"
    else rm -f "$SRV/current"; fi
    nginx -t || nginx_diagnostics
  }

  # ln -sfn onto a temporary name, then rename over `current`: rename is atomic,
  # so nginx never sees a missing or half-made link.
  ln -sfn "releases/$COMMIT" "$SRV/current.next"
  mv -Tf "$SRV/current.next" "$SRV/current"
  install -D -m 0644 "$staging/explorers.conf" "$NGINX_SITE_PATH"

  local test_output
  if ! test_output="$(nginx -t 2>&1)"; then
    printf '%s\n' "$test_output" >&2
    nginx_diagnostics
    restore
    fail "nginx -t rejected the new site; previous site and release restored"
  fi
  printf '%s\n' "$test_output"
  # nginx only WARNS when two files claim one server_name, then serves the first it
  # read - possibly the old site. That means EXPLORERS_NGINX_SITE_PATH is not the
  # file that serves the site today.
  if grep -q "conflicting server name \"$SERVER_NAME\"" <<<"$test_output"; then
    restore
    fail "another nginx file also serves $SERVER_NAME; set EXPLORERS_NGINX_SITE_PATH to that file. Previous site and release restored"
  fi
  if systemctl is-active --quiet nginx; then
    systemctl reload nginx || { nginx_diagnostics; restore; systemctl reload nginx || true; fail "nginx reload failed"; }
  else
    systemctl start nginx || { nginx_diagnostics; restore; fail "nginx did not start"; }
  fi
  systemctl is-active --quiet nginx || { nginx_diagnostics; fail "nginx is not active after reload"; }

  # Prove nginx now serves this release and reaches the API, through TLS as a browser
  # would. `nginx -s reload` (and so `systemctl reload nginx`) returns once the
  # master has the signal, before new workers listen: on the first deploy :443 is
  # not open yet, and on later ones the old workers still answer. So poll, bounded.
  local served="" ready="" expected deadline=$((SECONDS + 15))
  expected="$(cat "$RELEASE/dist/runtime-config.json")"
  until [[ "$served" == "$expected" && "$ready" == 200 ]]; do
    if (( SECONDS >= deadline )); then
      nginx_diagnostics
      restore
      systemctl reload nginx || true
      [[ "$served" == "$expected" ]] || fail "nginx did not serve release $COMMIT's runtime-config.json within 15s; previous site and release restored"
      fail "https://$SERVER_NAME/health/ready answered '${ready:-nothing}' through nginx, not 200; previous site and release restored"
    fi
    sleep 1
    served="$(curl -sk --max-time 5 --resolve "$SERVER_NAME:443:127.0.0.1" "https://$SERVER_NAME/runtime-config.json" || true)"
    ready="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 5 --resolve "$SERVER_NAME:443:127.0.0.1" "https://$SERVER_NAME/health/ready" || true)"
  done
  echo "release $COMMIT is live"

  # Keep the newest releases, never the live one.
  find "$SRV/releases" -mindepth 1 -maxdepth 1 -type d ! -name '.*' -printf '%T@ %p\n' | sort -rn \
    | awk -v keep="$KEEP_RELEASES" 'NR > keep { print $2 }' \
    | while read -r old; do [[ "$old" == "$RELEASE" ]] || rm -rf -- "$old"; done
}

case "$phase" in
  backup) backup ;;
  stage) stage ;;
  activate) activate ;;
  *) fail "unknown phase $phase" ;;
esac
