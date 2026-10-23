#!/usr/bin/env bash
# Renders production.env from the explorers-production GitHub environment, then
# validates it with deploy/host/validate-production-env.sh. Run by
# .github/workflows/explorers.yml before any SSH connection, and by the cutover
# rehearsal, so both exercise the same code.
#
#   bash deploy/render-production-env.sh <output-file>
#
# Every value comes from an environment variable named after its GitHub secret or
# variable (docs/operations/explorers-github-configuration.md); none is ever an
# argument, and none is ever printed. Messages name the variable and the rule
# only. Values are written with printf, a bash builtin, so they never appear on a
# process command line. Never add `set -x` here.
#
# Inputs:
#   secrets    EXPLORERS_AUTH_SECRET MUSIC_GATE_ATTESTATION_KEY GOOGLE_CLIENT_SECRET
#              GOOGLE_BOOKS_API_KEY TMDB_ACCESS_TOKEN
#              EXPLORERS_S3_ACCESS_KEY_ID      -> AWS_ACCESS_KEY_ID
#              EXPLORERS_S3_SECRET_ACCESS_KEY  -> AWS_SECRET_ACCESS_KEY
#              (distinct names on purpose: repository-level AWS_* secrets belong
#              to SES and must never reach this file)
#   variables  GOOGLE_CLIENT_ID EXPLORERS_MEDIA_S3_BUCKET EXPLORERS_MEDIA_S3_REGION
#              EXPLORERS_BACKUP_AGE_RECIPIENT EXPLORERS_SERVER_NAME
#              EXPLORERS_TRUSTED_PROXY_IP (optional; see below)
#   optional   IGDB_CLIENT_ID (variable) + IGDB_CLIENT_SECRET (secret): Games search.
#              Both or neither; with neither the lines are blank and Games stays
#              manual-only, so a deploy never waits on the Twitch app.
#   optional   GOOGLE_PLACES_API_KEY (secret): Places nearby lookup. Blank means
#              OpenStreetMap only.
#
# The two database password FILES are generated on the host by
# explorers-bootstrap.sh and never leave it; this file only names their paths.
set -Eeuo pipefail
set +x
umask 077

[[ "$#" -eq 1 ]] || { echo "usage: render-production-env.sh <output-file>" >&2; exit 2; }
out="$1"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
validator="$here/host/validate-production-env.sh"
[[ -f "$validator" ]] || { echo "::error::$validator is missing" >&2; exit 2; }

# The address host nginx reaches the API from is the egress network's gateway,
# which Docker picks when it first creates the network, so it cannot be known
# before the first deploy. Without the variable the first deploy uses the same
# guess as deploy/production.env.example, and stage prints the real address with
# a warning: set EXPLORERS_TRUSTED_PROXY_IP to it and redeploy.
readonly DEFAULT_TRUSTED_PROXY_IP=172.18.0.1

# production.env name, kind and GitHub name, in the order the file lists them.
readonly SOURCES=(
  "MUSIC_GATE_ATTESTATION_KEY secret MUSIC_GATE_ATTESTATION_KEY"
  "EXPLORERS_AUTH_SECRET secret EXPLORERS_AUTH_SECRET"
  "GOOGLE_CLIENT_ID variable GOOGLE_CLIENT_ID"
  "GOOGLE_CLIENT_SECRET secret GOOGLE_CLIENT_SECRET"
  "EXPLORERS_MEDIA_S3_BUCKET variable EXPLORERS_MEDIA_S3_BUCKET"
  "EXPLORERS_MEDIA_S3_REGION variable EXPLORERS_MEDIA_S3_REGION"
  "AWS_ACCESS_KEY_ID secret EXPLORERS_S3_ACCESS_KEY_ID"
  "AWS_SECRET_ACCESS_KEY secret EXPLORERS_S3_SECRET_ACCESS_KEY"
  "GOOGLE_BOOKS_API_KEY secret GOOGLE_BOOKS_API_KEY"
  "TMDB_ACCESS_TOKEN secret TMDB_ACCESS_TOKEN"
  "EXPLORERS_BACKUP_AGE_RECIPIENT variable EXPLORERS_BACKUP_AGE_RECIPIENT"
)

missing=0
single_line() { # <github-name>: a value with a line break would add lines to the file
  local value="${!1-}"
  if [[ "$value" == *$'\n'* || "$value" == *$'\r'* ]]; then
    echo "::error::$1 must be a single line" >&2; missing=1
  fi
}
for source in "${SOURCES[@]}"; do
  read -r _ kind github <<<"$source"
  if [[ -z "${!github-}" ]]; then
    echo "::error::Environment $kind $github is not set in explorers-production." >&2; missing=1
  fi
  single_line "$github"
done
single_line IGDB_CLIENT_ID
single_line IGDB_CLIENT_SECRET
single_line GOOGLE_PLACES_API_KEY
if [[ -n "${IGDB_CLIENT_ID-}" && -z "${IGDB_CLIENT_SECRET-}" ]]; then
  echo "::error::Environment secret IGDB_CLIENT_SECRET is not set in explorers-production; IGDB needs both IGDB_CLIENT_ID and IGDB_CLIENT_SECRET, or neither." >&2; missing=1
elif [[ -z "${IGDB_CLIENT_ID-}" && -n "${IGDB_CLIENT_SECRET-}" ]]; then
  echo "::error::Environment variable IGDB_CLIENT_ID is not set in explorers-production; IGDB needs both IGDB_CLIENT_ID and IGDB_CLIENT_SECRET, or neither." >&2; missing=1
fi
if [[ -z "${EXPLORERS_SERVER_NAME-}" ]]; then
  echo "::error::Repository variable EXPLORERS_SERVER_NAME is not set." >&2; missing=1
fi
single_line EXPLORERS_SERVER_NAME
single_line EXPLORERS_TRUSTED_PROXY_IP
[[ "$missing" == 0 ]] || exit 1

if [[ -z "${IGDB_CLIENT_ID-}" ]]; then
  echo "::notice::IGDB_CLIENT_ID and IGDB_CLIENT_SECRET are not set; Games search stays manual-only."
fi

trusted_proxy_ip="${EXPLORERS_TRUSTED_PROXY_IP-}"
if [[ -z "$trusted_proxy_ip" ]]; then
  trusted_proxy_ip="$DEFAULT_TRUSTED_PROXY_IP"
  echo "::notice::Environment variable EXPLORERS_TRUSTED_PROXY_IP is not set; using $DEFAULT_TRUSTED_PROXY_IP. Stage prints the real address: set the variable to it and redeploy."
fi

rm -f "$out"
{
  printf '# Rendered by deploy/render-production-env.sh from the explorers-production\n'
  printf '# GitHub environment. Every deploy overwrites it; change values in GitHub.\n'
  # Image placeholders, exactly as in production.env.example: explorers-deploy.sh
  # overrides all three on every deploy with the verified digest.
  printf '%s\n' \
    "EXPLORERS_API_IMAGE_NAME=ghcr.io/example-owner/explorers-tunes" \
    "EXPLORERS_API_DIGEST=sha256:0000000000000000000000000000000000000000000000000000000000000000" \
    "EXPLORERS_API_COMMIT=0000000000000000000000000000000000000000" \
    "DB_NAME=explorers" \
    "DB_MIGRATOR_USER=explorers_migrator" \
    "DB_RUNTIME_USER=explorers_runtime" \
    "DB_MIGRATOR_PASSWORD_FILE_HOST=/opt/explorers/secrets/db-migrator" \
    "DB_RUNTIME_PASSWORD_FILE_HOST=/opt/explorers/secrets/db-runtime"
  printf 'EXPLORERS_PUBLIC_ORIGIN=https://%s\n' "$EXPLORERS_SERVER_NAME"
  printf 'EXPLORERS_TRUSTED_PROXY_IP=%s\n' "$trusted_proxy_ip"
  for source in "${SOURCES[@]}"; do
    read -r name _ github <<<"$source"
    printf '%s=%s\n' "$name" "${!github}"
  done
  printf 'IGDB_CLIENT_ID=%s\n' "${IGDB_CLIENT_ID-}"
  printf 'IGDB_CLIENT_SECRET=%s\n' "${IGDB_CLIENT_SECRET-}"
  printf 'GOOGLE_PLACES_API_KEY=%s\n' "${GOOGLE_PLACES_API_KEY-}"
} > "$out"
chmod 0600 "$out"

if ! bash "$validator" "$out" "$EXPLORERS_SERVER_NAME"; then
  rm -f "$out"
  echo "::error::The rendered production.env failed validation (the FAIL lines above name each variable and rule). docs/operations/explorers-github-configuration.md maps each production.env name to its GitHub secret or variable." >&2
  exit 1
fi
