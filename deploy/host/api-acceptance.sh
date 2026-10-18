#!/usr/bin/env bash
# API acceptance checks, run after `explorers-deploy.sh stage` and before
# `activate` switches the SPA (P2 Task 7 Step 3.4). Talks to the API directly,
# presenting as host nginx does, so the API sees the production host and scheme.
#
#   bash deploy/host/api-acceptance.sh <api-base-url> <server-name>
#
# The deploy workflow runs it on the runner through an SSH tunnel
# (http://127.0.0.1:15000); the cutover rehearsal runs it on the stand-in host
# (http://127.0.0.1:5000). Both run this file, so the rehearsal tests what deploys.
set -euo pipefail

[[ "$#" -eq 2 ]] || { echo "usage: api-acceptance.sh <api-base-url> <server-name>" >&2; exit 2; }
api="$1"
server_name="$2"

probe() { curl -s --max-time 10 -H "Host: $server_name" -H "X-Forwarded-Proto: https" "$@"; }
check() {
  local path="$1" want_status="$2" want_body="$3" out status type body
  out="$(probe -D - "$api$path")" || { echo "::error::$path did not answer"; return 1; }
  status="$(printf '%s' "$out" | head -n 1 | awk '{print $2}')"
  type="$(printf '%s' "$out" | tr -d '\r' | grep -i '^content-type:' | head -n 1 || true)"
  body="$(printf '%s' "$out" | tr -d '\r' | awk 'f{print} /^$/{f=1}')"
  [[ "$status" == "$want_status" ]] || { echo "::error::$path answered $status, expected $want_status"; return 1; }
  [[ "$type" =~ application/json ]] || { echo "::error::$path is not JSON ($type) - the SPA shell or a proxy answered"; return 1; }
  [[ "$body" =~ $want_body ]] || { echo "::error::$path body did not match $want_body: $body"; return 1; }
  echo "ok $path -> $status"
}
check /health/ready 200 '"ready":true'
# The probe that actually reaches the database through the auth stack.
check /api/explorers/v1/me 401 'UNAUTHENTICATED'
# Better Auth itself answering: 200, literally null, never cacheable.
check /api/auth/get-session 200 '^null$'
probe -D - -o /dev/null "$api/api/auth/get-session" | tr -d '\r' | grep -iq '^cache-control:.*no-store' \
  || { echo "::error::/api/auth/get-session is cacheable"; exit 1; }
echo "ok /api/auth/get-session is no-store"
# TODO(P2 Task 6): add verifyCanonicalIngress(origin, { handle, category }) from
# scripts/replatform-route-parity.ts. It also proves the hidden-category privacy
# gate, which needs a real handle with a hidden category - none exists before the
# first sign-in, so it runs after cutover (deploy/rehearsal/probe.mts).
