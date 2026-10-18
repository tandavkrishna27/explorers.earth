#!/bin/sh
# Stand-in host boot: dockerd, then nginx, then wait. The rehearsal CA (from the
# rehearsal-certs volume) is trusted for the fake ghcr.io registry and by curl.
set -eu
if [ -f /rehearsal-certs/ca.pem ]; then
  install -D -m 0644 /rehearsal-certs/ca.pem /etc/docker/certs.d/ghcr.io/ca.crt
  install -m 0644 /rehearsal-certs/ca.pem /usr/local/share/ca-certificates/explorers-rehearsal-ca.crt
  update-ca-certificates >/dev/null 2>&1 || true
fi
dockerd >/var/log/dockerd.log 2>&1 &
i=0
until docker info >/dev/null 2>&1; do
  i=$((i + 1)); [ "$i" -lt 60 ] || { echo "dockerd did not start" >&2; tail -50 /var/log/dockerd.log >&2; exit 1; }
  sleep 1
done
nginx
echo "stand-in host ready"
exec sleep infinity
