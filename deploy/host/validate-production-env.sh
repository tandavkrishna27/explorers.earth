#!/usr/bin/env bash
# The one set of rules a production.env must pass. Two callers, so the rules
# cannot drift apart:
#   - .github/workflows/explorers.yml, through deploy/render-production-env.sh, on
#     the file it renders from the explorers-production environment, before any
#     SSH connection;
#   - deploy/host/explorers-bootstrap.sh check, on /opt/explorers/production.env.
#
#   bash validate-production-env.sh <production.env> <server-name>
#
# It checks content only. Ownership and mode are the host's business
# (explorers-bootstrap.sh and explorers-deploy.sh), and so are the database
# password files the DB_*_PASSWORD_FILE_HOST paths name, which exist only on the
# host.
#
# Every message names the variable and the rule, never the value. It never runs
# with xtrace. Exit 0 when valid, 1 when any rule fails (all are reported), 2 on
# bad arguments.
set -Eeuo pipefail
set +x

usage() { echo "usage: validate-production-env.sh <production.env> <server-name>" >&2; exit 2; }
[[ "$#" -eq 2 ]] || usage
env_file="$1"
server_name="$2"
[[ "$server_name" =~ ^[A-Za-z0-9.-]+$ ]] || { echo "validate-production-env.sh: the server name is malformed" >&2; exit 2; }
[[ -f "$env_file" && ! -L "$env_file" && -r "$env_file" ]] || { echo "validate-production-env.sh: $env_file is not a readable regular file" >&2; exit 2; }

# The image identity is supplied by explorers-deploy.sh on every deploy (and
# recorded in /opt/explorers/image.env), so it is not required here.
readonly REQUIRED=(DB_NAME DB_MIGRATOR_USER DB_RUNTIME_USER DB_MIGRATOR_PASSWORD_FILE_HOST
  DB_RUNTIME_PASSWORD_FILE_HOST MUSIC_GATE_ATTESTATION_KEY EXPLORERS_PUBLIC_ORIGIN EXPLORERS_AUTH_SECRET
  GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET EXPLORERS_TRUSTED_PROXY_IP EXPLORERS_MEDIA_S3_BUCKET
  EXPLORERS_MEDIA_S3_REGION AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY GOOGLE_BOOKS_API_KEY TMDB_ACCESS_TOKEN
  EXPLORERS_BACKUP_AGE_RECIPIENT)

# A bracket expression; in POSIX ERE a backslash inside one is literal.
readonly UNSAFE='[[:space:]"'"'"'`$#\]'

problems=0
problem() { echo "FAIL: production.env: $*" >&2; problems=$((problems + 1)); }

env_value() { sed -n "s/^$1=//p" "$env_file" | tail -n 1; }
env_count() { grep -c "^$1=" "$env_file" || true; }

for name in "${REQUIRED[@]}"; do
  value="$(env_value "$name")"
  if [[ -z "$value" ]]; then problem "$name is empty or missing"; continue; fi
  (( $(env_count "$name") == 1 )) || problem "$name is set more than once"
  # Every dummy in production.env.example says example/EXAMPLE or is all zeros.
  if [[ "$value" =~ [Ee][Xx][Aa][Mm][Pp][Ll][Ee] || "$value" =~ ^[0.:]+$ ]]; then
    problem "$name still holds the example value"
  fi
  # docker compose reads this file with --env-file: it strips quotes, cuts at
  # ' #', and expands $VAR in unquoted values. A value must survive that unchanged.
  if [[ "$value" =~ $UNSAFE ]]; then
    problem "$name must be one plain value: no whitespace, quotes, \$, # or backslash (docker compose would alter it)"
  fi
done

origin="$(env_value EXPLORERS_PUBLIC_ORIGIN)"
[[ "$origin" == "https://$server_name" ]] || problem "EXPLORERS_PUBLIC_ORIGIN must be exactly https://$server_name (no path, no trailing slash)"

for name in EXPLORERS_AUTH_SECRET MUSIC_GATE_ATTESTATION_KEY; do
  value="$(env_value "$name")"
  (( ${#value} >= 32 )) || problem "$name must be at least 32 characters"
done

migrator="$(env_value DB_MIGRATOR_USER)"
runtime="$(env_value DB_RUNTIME_USER)"
[[ "$migrator" != "$runtime" ]] || problem "DB_MIGRATOR_USER and DB_RUNTIME_USER must differ"
for name in DB_MIGRATOR_USER DB_RUNTIME_USER; do
  value="$(env_value "$name")"
  [[ "$value" =~ ^[a-z_][a-z0-9_]{0,62}$ ]] || problem "$name is not a plain lowercase identifier"
  [[ "$value" != postgres && "$value" != music_runtime ]] || problem "$name may not be postgres or music_runtime"
done

for name in DB_MIGRATOR_PASSWORD_FILE_HOST DB_RUNTIME_PASSWORD_FILE_HOST; do
  [[ "$(env_value "$name")" =~ ^/[A-Za-z0-9._/-]+$ ]] || problem "$name must be an absolute host path"
done

# platform-backup.mjs's assertAgeRecipient: a public key, never an identity.
[[ "$(env_value EXPLORERS_BACKUP_AGE_RECIPIENT)" =~ ^age1[0-9a-z]{58}$ ]] \
  || problem "EXPLORERS_BACKUP_AGE_RECIPIENT must be the age PUBLIC key (age1 + 58 characters); every deploy after the first refuses without it"
[[ "$(env_value EXPLORERS_TRUSTED_PROXY_IP)" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] \
  || problem "EXPLORERS_TRUSTED_PROXY_IP must be one IPv4 address"

if (( problems > 0 )); then
  echo "production.env: $problems problem(s)" >&2
  exit 1
fi
echo "production.env: every rule passes"
