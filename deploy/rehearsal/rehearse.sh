#!/usr/bin/env bash
# Cutover dress rehearsal: P2 Tasks 9-10 against a local stand-in for the
# explorers host. Never touches a real host, a real registry or a deploy secret.
#
#   bash deploy/rehearsal/rehearse.sh all        # tear down any previous run, then the whole rehearsal;
#                                              # the stand-in stays up for inspection until `down`
#   bash deploy/rehearsal/rehearse.sh <stage>... # individual stages, in order
#   bash deploy/rehearsal/rehearse.sh down       # remove every rehearsal container and volume
#
# Stages: up bootstrap images first-deploy taxonomy verify backup redeploy rollback forward down
#
# What stands in for what:
#   explorers host   a privileged Ubuntu 24.04 container (standin-host/) running
#                    its own dockerd and host nginx; apt's docker.io,
#                    docker-compose-v2 and nginx
#   ghcr.io          registry:2 on a private Docker network under the alias
#                    ghcr.io, with a rehearsal CA the stand-in trusts. The stand-in
#                    pulls ghcr.io/<owner>/explorers-tunes@sha256:... exactly as the
#                    host will; nothing else resolves that name to it
#   tunes.yml        `docker build` of tunes/ with the same tag and build args,
#                    then `docker push` (publish-image) to get the registry digest
#   explorers.yml    the same scripts it ships: assemble-release.sh,
#                    render-site.sh, explorers-deploy.sh stage/activate and
#                    api-acceptance.sh, copied in with `docker cp` instead of scp
#   S3 (backups)     never contacted. The deploy's own backup phase runs while
#                    the host has no migrated database (it reports 'fresh' without
#                    S3); after that the same pre-deploy backup is taken in
#                    platform-backup.mjs's local mode, and #141's restore drill
#                    restores it into a disposable PostgreSQL on this machine
#   DNS + TLS        explorers.rehearsal.test, a certificate from the rehearsal CA,
#                    published on 127.0.0.1:$HTTPS_PORT; probe.ts and the browser
#                    check dial that port while keeping the real hostname
#
# Every command and its duration go to $OUT/transcript.log and $OUT/timings.tsv.
# Needs: docker, node (with the repo's root, explorers-earth and tunes
# node_modules installed), git, and bash (Git Bash on Windows is fine).
set -Eeuo pipefail

# Native paths for docker, git and node on Git Bash; identity elsewhere.
hp() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi; }
repo="$(hp "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)")"
here="$repo/deploy/rehearsal"
OUT="$(hp "${REHEARSAL_OUT:-$repo/.rehearsal}")"
HTTPS_PORT="${REHEARSAL_HTTPS_PORT:-8443}"
REGISTRY_PORT="${REHEARSAL_REGISTRY_PORT:-5555}"
readonly NET=explorers-rehearsal HOST=explorers-rehearsal-host REGISTRY=explorers-rehearsal-registry
readonly CERTS=explorers-rehearsal-certs HOST_IMAGE=explorers-rehearsal-host:local
readonly SERVER_NAME=explorers.rehearsal.test
readonly ORIGIN="https://$SERVER_NAME"
readonly OWNER=tandavkrishna27
readonly IMAGE_NAME="ghcr.io/$OWNER/explorers-tunes"
readonly LOCAL_PUSH="localhost:$REGISTRY_PORT/$OWNER/explorers-tunes"
readonly TLS_DIR=/etc/ssl/explorers-rehearsal
readonly GOOGLE_CLIENT_ID=rehearsal-client-id.apps.googleusercontent.com
# Two rehearsal-only commit identities for the redeploy and forward images. They
# are not commits in the repository; the deploy only needs 40 hex characters.
readonly COMMIT_V2=2222222222222222222222222222222222222222
readonly COMMIT_V3=3333333333333333333333333333333333333333
readonly FORWARD_MIGRATION=0058_rehearsal_forward_probe

mkdir -p "$OUT"
transcript="$OUT/transcript.log"
timings="$OUT/timings.tsv"
[[ -f "$timings" ]] || printf 'stage\tstep\tseconds\texit\n' > "$timings"
stage_name=setup

# Git Bash rewrites arguments that look like POSIX paths (/opt/..., /tmp/...)
# before docker sees them; these are paths inside containers.
docker() { MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' command docker "$@"; }
export -f docker

log() { printf '%s\n' "$*" | tee -a "$transcript"; }
# step <label> <command...>: run, log the command, its output and its duration.
step() {
  local label="$1"; shift
  local started=$SECONDS status=0
  log ""
  log "### [$stage_name] $label"
  log "\$ $*"
  "$@" 2>&1 | tee -a "$transcript" || status=${PIPESTATUS[0]}
  local took=$((SECONDS - started))
  printf '%s\t%s\t%s\t%s\n' "$stage_name" "$label" "$took" "$status" >> "$timings"
  log "--> exit $status in ${took}s"
  return "$status"
}
# expect_fail <label> <command...>: the step must fail; succeeding is the error.
expect_fail() {
  local label="$1"; shift
  if step "$label (expected to fail)" "$@"; then log "!!! $label succeeded but must not"; return 1; fi
  log "--> refused, as it must be"
}
on_host() { docker exec -i "$HOST" "$@"; }
host_bash() { docker exec -i "$HOST" bash -c "$1"; }
# The operator's compose command on the host, with the deployed image identity.
host_compose() {
  host_bash "docker compose -f /opt/explorers/production.compose.yml --env-file /opt/explorers/production.env --env-file /opt/explorers/image.env $*"
}
psql_host() {
  host_bash "docker compose -f /opt/explorers/production.compose.yml --env-file /opt/explorers/production.env --env-file /opt/explorers/image.env exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -tA'" <<<"$1"
}

# ---------------------------------------------------------------------------
stage_up() {
  step "build the stand-in host image" docker build -t "$HOST_IMAGE" "$(hp "$here/standin-host")"
  docker network inspect "$NET" >/dev/null 2>&1 || step "create the rehearsal network" docker network create "$NET"
  step "generate the rehearsal CA, the ghcr.io certificate and the site certificate" \
    docker run --rm -v "$CERTS:/c" --entrypoint bash "$HOST_IMAGE" -c '
      set -e; cd /c; [ -f ca.pem ] && { echo "certificates exist"; exit 0; }
      openssl req -x509 -newkey rsa:2048 -nodes -days 7 -subj "/CN=explorers rehearsal CA" -keyout ca.key -out ca.pem 2>/dev/null
      leaf() { openssl req -x509 -newkey rsa:2048 -nodes -days 7 -subj "/CN=$1" -addext "subjectAltName=$2" \
        -addext basicConstraints=critical,CA:FALSE -CA ca.pem -CAkey ca.key -keyout "$3.key" -out "$3.pem" 2>/dev/null; }
      leaf ghcr.io "DNS:ghcr.io,DNS:localhost,IP:127.0.0.1" ghcr
      leaf explorers.rehearsal.test "DNS:explorers.rehearsal.test" site
      chmod 0644 *.pem *.key; ls'
  docker run --rm -v "$CERTS:/c" --entrypoint cat "$HOST_IMAGE" /c/ca.pem > "$OUT/ca.pem"
  if ! docker inspect "$REGISTRY" >/dev/null 2>&1; then
    step "start the fake ghcr.io registry" docker run -d --name "$REGISTRY" --network "$NET" --network-alias ghcr.io \
      -p "127.0.0.1:$REGISTRY_PORT:443" -v "$CERTS:/certs:ro" \
      -e REGISTRY_HTTP_ADDR=0.0.0.0:443 -e REGISTRY_HTTP_TLS_CERTIFICATE=/certs/ghcr.pem -e REGISTRY_HTTP_TLS_KEY=/certs/ghcr.key \
      registry:2
  fi
  if ! docker inspect "$HOST" >/dev/null 2>&1; then
    step "start the stand-in host" docker run -d --name "$HOST" --hostname explorers-standin --privileged \
      --network "$NET" -p "127.0.0.1:$HTTPS_PORT:443" -v "$CERTS:/rehearsal-certs:ro" "$HOST_IMAGE"
  fi
  local i=0
  until docker logs "$HOST" 2>&1 | grep -q "stand-in host ready"; do
    i=$((i + 1)); (( i < 90 )) || { docker logs "$HOST"; return 1; }; sleep 1
  done
  step "stand-in versions" host_bash 'docker --version; docker compose version; nginx -v 2>&1; . /etc/os-release; echo "$PRETTY_NAME"'
}

# ---------------------------------------------------------------------------
# P2 Task 9 on the stand-in. Step 1 (backup) has nothing to back up on a fresh
# host; Step 1a (handle holds) was dropped with the no-real-users decision.
stage_bootstrap() {
  step "copy the bootstrap script and the env example to the host" bash -c "
    docker exec -i $HOST install -d -m 0700 /root/deploy &&
    docker cp '$(hp "$repo/deploy/host/explorers-bootstrap.sh")' $HOST:/root/deploy/explorers-bootstrap.sh &&
    docker cp '$(hp "$repo/deploy/production.env.example")' $HOST:/root/deploy/production.env.example"
  # Step 2 + 3: the first run installs the example and stops.
  expect_fail "bootstrap init (installs production.env from the example, then stops)" \
    on_host bash /root/deploy/explorers-bootstrap.sh init "$SERVER_NAME" /root/deploy/production.env.example
  expect_fail "bootstrap check with the example values still in place" \
    on_host bash /root/deploy/explorers-bootstrap.sh check "$SERVER_NAME"
  # Step 6: the certbot stand-in.
  step "install the site certificate (stands in for certbot)" host_bash "
    install -d -m 0755 $TLS_DIR && install -m 0644 /rehearsal-certs/site.pem $TLS_DIR/fullchain.pem &&
    install -m 0600 /rehearsal-certs/site.key $TLS_DIR/privkey.pem && ls -l $TLS_DIR"
  # Step 7: fill production.env. Random secrets; dummy third-party keys.
  step "fill production.env (Task 9 Step 7)" host_bash "
    set -e; f=/opt/explorers/production.env
    set_value() { sed -i \"s|^\$1=.*|\$1=\$2|\" \$f; }
    set_value MUSIC_GATE_ATTESTATION_KEY \$(openssl rand -hex 32)
    set_value EXPLORERS_AUTH_SECRET \$(openssl rand -hex 32)
    set_value EXPLORERS_PUBLIC_ORIGIN $ORIGIN
    set_value GOOGLE_CLIENT_ID $GOOGLE_CLIENT_ID
    set_value GOOGLE_CLIENT_SECRET rehearsal-google-secret-\$(openssl rand -hex 8)
    # Task 9 Step 9 says to find this after the stack is up; compose needs a value
    # before. The 'verify' stage measures the real one.
    set_value EXPLORERS_TRUSTED_PROXY_IP 172.18.0.1
    set_value EXPLORERS_MEDIA_S3_BUCKET rehearsal-media-bucket
    set_value AWS_ACCESS_KEY_ID REHEARSALACCESSKEY00
    set_value AWS_SECRET_ACCESS_KEY rehearsal-secret-\$(openssl rand -hex 8)
    set_value GOOGLE_BOOKS_API_KEY rehearsal-books-key
    set_value TMDB_ACCESS_TOKEN rehearsal-tmdb-token
    grep -c = \$f"
  # The owner's age identity. In production it is generated on the owner's machine
  # and only the public key reaches the host; here it is a throwaway, and the
  # backup stage's drill reads the private half from $OUT.
  docker cp "$(hp "$repo/tunes/deployment/platform-backup.mjs")" "$HOST:/root/deploy/platform-backup.mjs"
  docker cp "$(hp "$here/standin-host/make-age-identity.sh")" "$HOST:/root/deploy/make-age-identity.sh"
  step "generate the backup age identity; put its public key in production.env" on_host bash /root/deploy/make-age-identity.sh
  on_host cat /root/rehearsal-keys/identity.age > "$OUT/age-identity.txt"
  step "bootstrap check (Task 9 Steps 2-4, 9)" on_host bash /root/deploy/explorers-bootstrap.sh check "$SERVER_NAME"
}

# ---------------------------------------------------------------------------
# tunes.yml: build once, push, read the registry digest.
push_image() { # <local-tag> -> prints the digest
  docker tag "$1" "$2" >/dev/null
  docker push "$2" >"$OUT/push.log" 2>&1 || { cat "$OUT/push.log" >&2; return 1; }
  sed -n 's/.*digest: \(sha256:[a-f0-9]\{64\}\).*/\1/p' "$OUT/push.log" | tail -n 1
}
build_image() { # <commit> <context>
  docker build "$(hp "$2")" -f "$(hp "$2/Dockerfile")" --build-arg "BUILD_COMMIT=$1" \
    --build-arg "BUILD_SOURCE=https://github.com/$OWNER/explorers.earth" -t "$IMAGE_NAME:$1"
}
stage_images() {
  local v1; v1="$(git -C "$repo" rev-parse HEAD)"
  step "build v1 = HEAD ($v1), as tunes.yml does" build_image "$v1" "$repo/tunes"
  step "build v2 = the same source as another commit (redeploy)" build_image "$COMMIT_V2" "$repo/tunes"
  # v3 adds one migration, so deploying it moves the schema forward.
  local v3ctx="$OUT/v3-context"
  rm -rf "$v3ctx" && mkdir -p "$v3ctx"
  step "prepare v3 = HEAD plus migration $FORWARD_MIGRATION" bash -c "
    set -e
    git -C '$repo' archive HEAD tunes | tar -x -C '$v3ctx' --strip-components=1
    printf '%s\n' \"COMMENT ON SCHEMA public IS 'cutover rehearsal forward probe';\" > '$v3ctx/migrations/$FORWARD_MIGRATION.sql'
    sed -i -e 's/^export const EXPECTED_MUSIC_MIGRATION_ID = \"0057_retire_music_category\"/export const EXPECTED_MUSIC_MIGRATION_ID = \"$FORWARD_MIGRATION\"/' \
      -e 's/^  EXPECTED_MUSIC_MIGRATION_ID,$/  \"0057_retire_music_category\",\n  EXPECTED_MUSIC_MIGRATION_ID,/' '$v3ctx/shared/music-migration-contract.ts'
    grep -c '0057_retire_music_category' '$v3ctx/shared/music-migration-contract.ts'"
  step "build v3" build_image "$COMMIT_V3" "$v3ctx"
  local commit digest
  : > "$OUT/images.env"
  for commit in "$v1" "$COMMIT_V2" "$COMMIT_V3"; do
    log "### [$stage_name] push $commit (publish-image)"
    local started=$SECONDS
    digest="$(push_image "$IMAGE_NAME:$commit" "$LOCAL_PUSH:$commit")"
    [[ "$digest" =~ ^sha256:[a-f0-9]{64}$ ]] || { log "no digest from the push"; return 1; }
    printf '%s\tpush %s\t%s\t0\n' "$stage_name" "$commit" "$((SECONDS - started))" >> "$timings"
    log "--> $IMAGE_NAME@$digest"
    printf '%s=%s\n' "$commit" "$digest" >> "$OUT/images.env"
  done
}
digest_of() { sed -n "s/^$1=//p" "$OUT/images.env"; }

# ---------------------------------------------------------------------------
# explorers.yml's "Assemble the release and render the nginx site" + upload.
public_json() {
  # A dummy browser key of the right shape, so the CSP gains the Maps origins.
  printf '{"version":1,"environment":"production","origin":"%s","apiPath":"/api","socketPath":"/socket.io","mapsBrowserKey":"rehearsalMapsKey0000","analytics":{"enabled":false}}' "$ORIGIN" > "$OUT/public.json"
}
stage_release() { # <commit> <site-path> <compose-file>
  local commit="$1" site_path="$2" compose_file="$3" stage="$OUT/stage-$1"
  public_json
  [[ -f "$repo/explorers-earth/dist/index.html" ]] || step "build the platform SPA" bash -c "
    cd '$repo/explorers-earth' && npm run landing:check && npx tsc -b &&
    npx vite build --config vite.platform.config.ts --mode platform && node scripts/check-music-production-bundle.mjs"
  rm -rf "$stage" "$OUT/release/$commit"; mkdir -p "$stage" "$OUT/release"
  step "assemble the release" sh "$repo/deploy/assemble-release.sh" "$OUT/public.json" "$repo/explorers-earth/dist" "$OUT/release/$commit"
  step "pack the release and render the nginx site" bash -c "
    set -e
    (cd '$OUT/release' && tar -czf ../stage-$commit/release.tar.gz '$commit')
    EXPLORERS_SERVER_NAME=$SERVER_NAME EXPLORERS_TLS_CERTIFICATE=$TLS_DIR/fullchain.pem \
      EXPLORERS_TLS_CERTIFICATE_KEY=$TLS_DIR/privkey.pem sh '$repo/deploy/nginx/render-site.sh' '$repo/deploy/nginx/explorers.conf' '$stage/explorers.conf'
    cp '$compose_file' '$stage/production.compose.yml'
    cp '$repo/deploy/host/explorers-deploy.sh' '$stage/explorers-deploy.sh'
    cp '$repo/tunes/deployment/platform-backup.mjs' '$stage/platform-backup.mjs'
    printf 'IMAGE_NAME=%s\nIMAGE_DIGEST=%s\nCOMMIT=%s\nNGINX_SITE_PATH=%s\nSERVER_NAME=%s\n' \
      '$IMAGE_NAME' '$(digest_of "$commit")' '$commit' '$site_path' '$SERVER_NAME' > '$stage/deploy.env'
    ls -l '$stage'"
  step "upload to the host (scp)" bash -c "
    docker exec $HOST bash -c 'rm -rf /tmp/explorers-deploy-$commit && install -d -m 700 /tmp/explorers-deploy-$commit' &&
    docker cp '$(hp "$stage")/.' $HOST:/tmp/explorers-deploy-$commit/"
}
deploy_stage() { step "explorers-deploy.sh stage ($1)" on_host bash "/tmp/explorers-deploy-$1/explorers-deploy.sh" stage "/tmp/explorers-deploy-$1"; }
deploy_accept() {
  step "api-acceptance.sh (before the SPA switches)" bash -c "
    docker cp '$(hp "$repo/deploy/host/api-acceptance.sh")' $HOST:/root/deploy/api-acceptance.sh &&
    docker exec $HOST bash /root/deploy/api-acceptance.sh http://127.0.0.1:5000 $SERVER_NAME"
}
deploy_activate() { step "explorers-deploy.sh activate ($1)" on_host bash "/tmp/explorers-deploy-$1/explorers-deploy.sh" activate "/tmp/explorers-deploy-$1"; }
# explorers.yml's "Take a pre-deploy backup on the host". On a host with no
# migrated database the real phase runs and must report 'fresh'. Once there is
# one, the real phase uploads to S3, which the rehearsal never contacts, so the
# same pre-deploy backup, bound to the same candidate, is taken in local mode.
deploy_backup() { # <commit>
  local commit="$1" remote="/tmp/explorers-deploy-$1"
  if [[ -z "$(on_host rehearsal-db-head)" ]]; then
    step "explorers-deploy.sh backup ($commit)" host_bash \
      "bash $remote/explorers-deploy.sh backup $remote && echo backup-result: \$(cat $remote/backup-result) && grep -qx fresh $remote/backup-result"
  else
    step "pre-deploy backup ($commit; local mode stands in for the S3 phase)" host_bash \
      "node /opt/explorers/platform-backup.mjs --environment local --reason pre-deploy --candidate-digest $(digest_of "$commit") --candidate-commit $commit --output-manifest $remote/backup-manifest.json && jq -c '{complete, migrationMarker, imageDigest, sourceCommit}' $remote/backup-manifest.json"
  fi
}
deploy() { # <commit> <site-path> <compose-file>
  stage_release "$@"
  deploy_backup "$1"
  deploy_stage "$1"
  deploy_accept
  deploy_activate "$1"
}
journal() { psql_host "SELECT count(*) || ' migrations, head ' || max(id) FROM music_schema_migrations;"; }

# ---------------------------------------------------------------------------
stage_first_deploy() {
  local v1; v1="$(git -C "$repo" rev-parse HEAD)"
  step "database before the first deploy" host_bash "docker volume ls --format '{{.Name}}' | grep -c explorers-canonical || true"
  # The plan's unknown: which file serves the hostname today. Point the deploy at
  # a new file while the legacy site still claims the name, and it must refuse
  # and put everything back.
  stage_release "$v1" /etc/nginx/conf.d/explorers.conf "$repo/deploy/production.compose.yml"
  deploy_backup "$v1"
  # A first deploy whose stage died after starting postgres and before migrating
  # leaves a running, empty database. The re-run's backup phase must still say
  # 'fresh' (it used to fail on the missing journal).
  step "start postgres alone, empty (a first stage that died before migrating)" host_bash \
    "docker compose -f /tmp/explorers-deploy-$v1/production.compose.yml --env-file /opt/explorers/production.env up -d --wait postgres"
  deploy_backup "$v1"
  deploy_stage "$v1"
  fix_trusted_proxy
  deploy_accept
  expect_fail "activate with EXPLORERS_NGINX_SITE_PATH not the live site file" deploy_activate "$v1"
  step "the legacy site still serves after the refused activate" host_bash \
    "curl -s -H 'Host: $SERVER_NAME' http://127.0.0.1/ | grep -c legacy-spa-marker; test ! -e /etc/nginx/conf.d/explorers.conf"
  step "bootstrap check names the file that serves the hostname" on_host bash /root/deploy/explorers-bootstrap.sh check "$SERVER_NAME"
  # sites-enabled/explorers-legacy is a symlink; point at its target.
  deploy "$v1" /etc/nginx/sites-available/explorers-legacy "$repo/deploy/production.compose.yml"
  step "migration journal after the first deploy" journal
}

stage_taxonomy() {
  # P2 Task 10 Step 2 exactly as the plan wrote it.
  expect_fail "taxonomy dry-run, the plan's literal command" host_bash     "cd /root && docker compose -f /opt/explorers/production.compose.yml run --rm migrate node dist/scripts/apply-reviewed-taxonomy.js --dry-run"
  # The bundle is dist/apply-reviewed-taxonomy.js (P2 Task 2), and compose needs
  # the env file and the deployed image identity.
  step "taxonomy dry-run" host_compose "run --rm --no-deps migrate node dist/apply-reviewed-taxonomy.js --dry-run"
  step "taxonomy apply" host_compose "run --rm --no-deps migrate node dist/apply-reviewed-taxonomy.js --apply --reviewed-by rehearsal-operator"
  step "taxonomy apply again (no-op)" host_compose "run --rm --no-deps migrate node dist/apply-reviewed-taxonomy.js --apply --reviewed-by rehearsal-operator"
  step "taxonomy catalogs" psql_host "SELECT category, state, version, default_locale FROM taxonomy_catalogs ORDER BY 1; SELECT category || ': ' || count(*) || ' terms' FROM taxonomy_terms GROUP BY category;"
}

stage_verify() {
  step "probe.mts (verifyCanonicalIngress, Google sign-in, CSP, runtime config)" \
    node "$repo/node_modules/tsx/dist/cli.mjs" "$here/probe.mts" --origin "$ORIGIN" --connect "127.0.0.1:$HTTPS_PORT" \
      --ca "$OUT/ca.pem" --google-client-id "$GOOGLE_CLIENT_ID" --public-json "$OUT/public.json"
  step "the SPA renders in a browser" node "$here/spa-smoke.mjs" "$ORIGIN" "127.0.0.1:$HTTPS_PORT"
  step "trusted proxy, direct and through nginx (Task 9 Step 9)" trusted_proxy nginx
}
# Task 9 Step 9. The first deploy runs with a guessed EXPLORERS_TRUSTED_PROXY_IP
# (compose needs a value before Docker has created the network) and stage warns.
# Measure the shared bucket, set the value stage printed, recreate the api.
fix_trusted_proxy() {
  expect_fail "trusted proxy as first deployed (the guessed address)" trusted_proxy direct
  step "set EXPLORERS_TRUSTED_PROXY_IP to the egress gateway and recreate the api" host_bash "
    set -e
    c=\$(docker ps -qf label=com.docker.compose.service=api)
    g=\$(docker inspect -f '{{with index .NetworkSettings.Networks \"explorers-canonical_egress\"}}{{.Gateway}}{{end}}' \$c)
    sed -i \"s|^EXPLORERS_TRUSTED_PROXY_IP=.*|EXPLORERS_TRUSTED_PROXY_IP=\$g|\" /opt/explorers/production.env
    docker compose -f /opt/explorers/production.compose.yml --env-file /opt/explorers/production.env --env-file /opt/explorers/image.env up -d --wait api"
  step "trusted proxy after the fix" trusted_proxy direct
}
# Exits non-zero unless the API trusts exactly the address nginx reaches it from.
# trusted_proxy direct|nginx: 'nginx' also checks spoofing through the live site,
# which only exists after activate.
trusted_proxy() {
  host_bash "via=$1

    c=\$(docker ps -qf label=com.docker.compose.service=api)
    g=\$(docker inspect -f '{{with index .NetworkSettings.Networks \"explorers-canonical_egress\"}}{{.Gateway}}{{end}}' \$c)
    echo \"egress gateway \$g; configured \$(sed -n 's/^EXPLORERS_TRUSTED_PROXY_IP=//p' /opt/explorers/production.env)\"
    echo \"the plan's Task 9 Step 9 command prints: \$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.Gateway}}{{end}}' \$c)\"
    # draft-7 RateLimit header: remaining=N. Straight to the API from the host
    # (peer = the gateway), two X-Forwarded-For values must get separate buckets.
    # Through nginx, spoofed values from one client must share one: nginx appends
    # the real peer and only the gateway hop is trusted.
    remaining() { curl -s -D - -o /dev/null \"\$@\" | tr -d '\r' | sed -n 's/^ratelimit: .*remaining=\([0-9]*\).*/\1/Ip'; }
    p=/api/explorers/v1/profiles/rehearsal-no-such-handle
    n=\$RANDOM
    c1=\$(remaining -H 'Host: $SERVER_NAME' -H \"X-Forwarded-For: 198.51.100.\$((n % 200 + 1))\" http://127.0.0.1:5000\$p)
    c2=\$(remaining -H 'Host: $SERVER_NAME' -H \"X-Forwarded-For: 198.51.100.\$((n % 200 + 2))\" http://127.0.0.1:5000\$p)
    if [ \$via = direct ]; then a1=1; a2=0; else
    a1=\$(remaining --resolve $SERVER_NAME:443:127.0.0.1 -H 'X-Forwarded-For: 203.0.113.10' https://$SERVER_NAME\$p)
    a2=\$(remaining --resolve $SERVER_NAME:443:127.0.0.1 -H 'X-Forwarded-For: 203.0.113.20' https://$SERVER_NAME\$p); fi
    echo \"direct, two XFF values: remaining \$c1 then \$c2 (separate buckets: equal)\"
    [ \$via = direct ] || echo \"through nginx, two spoofed XFF values: remaining \$a1 then \$a2 (one bucket: second is one lower)\"
    if [ \"\$c1\" = \"\$c2\" ] && [ \"\$a2\" = \$((a1 - 1)) ]; then echo 'trust proxy is live and not spoofable'
    else echo 'trust proxy is NOT live: every visitor shares one rate-limit bucket'; exit 1; fi"
}

# Backup and restore with #141's tooling: a backup on the host, then the monthly
# drill on the owner's machine (this one), which restores it into a disposable
# PostgreSQL, boots the canonical app against it and writes a timed receipt.
stage_backup() {
  step "backup on the host (platform-backup.mjs, local mode)" host_bash \
    "node /opt/explorers/platform-backup.mjs --environment local --reason manual && cat /var/backups/explorers/local/backups/LATEST.json"
  local key folder receipt
  key="$(on_host jq -r .manifestKey /var/backups/explorers/local/backups/LATEST.json)"
  folder="$(basename "$(dirname "$key")")"
  rm -rf "$OUT/backup" && mkdir -p "$OUT/backup"
  step "copy the backup off the host ($folder)" docker cp "$HOST:/var/backups/explorers/local/backups/$folder" "$(hp "$OUT/backup")/$folder"
  receipt="$(node "$here/drill-tools.mjs" receipt-path)"
  printf '%s\n' "$receipt" > "$OUT/drill-receipt-path"
  step "restore drill into a disposable PostgreSQL (npm run platform:restore-drill)" bash -c "
    cd '$repo' && node node_modules/tsx/dist/cli.mjs scripts/platform-restore-drill.ts \
      --manifest '$OUT/backup/$folder/manifest.json' --identity '$OUT/age-identity.txt' --receipt '$receipt'"
  step "recovery time, from the drill receipt" node "$here/drill-tools.mjs" timings "$receipt/receipt.json"
  # The deploy gate admits only prod manifests, so it is evaluated on this backup
  # relabelled as prod: with the receipt committed in the repository, and with
  # the one this drill just wrote.
  step "deploy gate: committed receipt vs this drill's receipt (simulated prod manifest)" bash -c "
    cd '$repo/tunes' && node node_modules/tsx/dist/cli.mjs '$here/drill-tools.mjs' gate \
      '$OUT/backup/$folder/manifest.json' '$repo/docs/replatform/evidence/recovery-receipt.json' '$receipt/receipt.json'"
}

stage_redeploy() {
  local v1; v1="$(git -C "$repo" rev-parse HEAD)"
  step "journal before the redeploy" journal
  outage_watch start
  deploy "$COMMIT_V2" /etc/nginx/sites-available/explorers-legacy "$repo/deploy/production.compose.yml"
  outage_watch stop
  step "journal after the redeploy (unchanged)" journal
  step "serving v2" host_bash "readlink /srv/explorers/current; docker inspect -f '{{.Config.Image}} {{.State.Status}} {{.State.Health.Status}}' \$(docker ps -qf label=com.docker.compose.service=api)"
}

stage_rollback() {
  local v1; v1="$(git -C "$repo" rev-parse HEAD)"
  outage_watch start
  deploy "$v1" /etc/nginx/sites-available/explorers-legacy "$repo/deploy/production.compose.yml"
  outage_watch stop
  step "journal after rolling back to v1 (unchanged: the image went back, the schema did not)" journal
  step "serving v1" host_bash "readlink /srv/explorers/current; docker inspect -f '{{.Config.Image}} {{.State.Status}} {{.State.Health.Status}}' \$(docker ps -qf label=com.docker.compose.service=api)"
}

stage_forward() {
  local v1 forward_compose="$OUT/production.compose.v3.yml"
  v1="$(git -C "$repo" rev-parse HEAD)"
  sed "s/^x-migration-marker: &migration-marker .*/x-migration-marker: \&migration-marker $FORWARD_MIGRATION/" \
    "$repo/deploy/production.compose.yml" > "$forward_compose"
  deploy "$COMMIT_V3" /etc/nginx/sites-available/explorers-legacy "$forward_compose"
  step "journal after v3 (moved forward)" journal
  # Rolling the image back past a migration must be refused before anything changes.
  stage_release "$v1" /etc/nginx/sites-available/explorers-legacy "$repo/deploy/production.compose.yml"
  expect_fail "roll back to v1 after the schema moved forward" deploy_stage "$v1"
  step "journal after the refused rollback (still forward)" journal
  step "v3 still serving" host_bash "readlink /srv/explorers/current; docker inspect -f '{{.Config.Image}} {{.State.Status}} {{.State.Health.Status}}' \$(docker ps -qf label=com.docker.compose.service=api); curl -sf http://127.0.0.1:5000/health/ready"
  step "the host's compose file and image record after the refused rollback" host_bash     "grep '^x-migration-marker' /opt/explorers/production.compose.yml; cat /opt/explorers/image.env"
  # What the refusal prevents: the v1 image's gate against the v3 schema, run by
  # hand with the v1 compose file. It must fail without touching the journal.
  expect_fail "a forced rollback: v1's migration gate against the forward schema" host_bash "
    EXPLORERS_API_IMAGE_NAME=$IMAGE_NAME EXPLORERS_API_DIGEST=$(digest_of "$v1") EXPLORERS_API_COMMIT=$v1 docker compose -f /tmp/explorers-deploy-$v1/production.compose.yml       --env-file /opt/explorers/production.env run --rm --no-deps migrate 2>&1 | tail -n 15; exit \${PIPESTATUS[0]}"
  step "journal after the forced attempt (still forward)" journal
}

# Polls /health/ready through nginx every 0.5s while a deploy runs; reports the
# longest run of non-200 answers, which is the API outage a redeploy costs.
outage_watch() {
  if [[ "$1" == start ]]; then
    host_bash "nohup bash -c 'while :; do printf \"%s %s\n\" \"\$(date +%s.%N)\" \"\$(curl -sk -o /dev/null -w %{http_code} --max-time 2 --resolve $SERVER_NAME:443:127.0.0.1 https://$SERVER_NAME/health/ready)\"; sleep 0.5; done' > /root/outage.log 2>&1 & echo \$! > /root/outage.pid"
  else
    step "API availability during the deploy" host_bash "
      kill \$(cat /root/outage.pid) 2>/dev/null || true
      awk '{ if (\$2 != 200) { if (!s) s = \$1; e = \$1; n++ } else if (s) { if (e - s > m) m = e - s; s = 0 } }
           END { if (s && e - s > m) m = e - s; printf \"%d polls, %d not 200, longest outage %.1fs\n\", NR, n, m }' /root/outage.log"
  fi
}

stage_down() {
  # -v removes each container's anonymous volumes (the stand-in's /var/lib/docker,
  # the registry's storage) and nothing else.
  docker rm -f -v "$HOST" "$REGISTRY" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  docker volume rm "$CERTS" >/dev/null 2>&1 || true
  log "rehearsal containers, network and certificates removed"
}

run_stage() {
  stage_name="$1"
  log ""; log "======== stage $1 ($(date -u +%FT%TZ))"
  local started=$SECONDS
  case "$1" in
    up) stage_up ;; bootstrap) stage_bootstrap ;; images) stage_images ;;
    first-deploy) stage_first_deploy ;; taxonomy) stage_taxonomy ;; verify) stage_verify ;; backup) stage_backup ;;
    redeploy) stage_redeploy ;; rollback) stage_rollback ;; forward) stage_forward ;; down) stage_down ;;
    *) echo "unknown stage $1" >&2; exit 2 ;;
  esac
  printf '%s\t(total)\t%s\t0\n' "$1" "$((SECONDS - started))" >> "$timings"
}

[[ "$#" -ge 1 ]] || { sed -n '2,10p' "$0"; exit 2; }
if [[ "$1" == all ]]; then
  set -- down up bootstrap images first-deploy taxonomy verify backup redeploy rollback forward
fi
for stage in "$@"; do run_stage "$stage"; done
log ""; log "timings: $timings"
