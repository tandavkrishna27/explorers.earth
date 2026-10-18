# A stand-in for the explorers host, for the cutover dress rehearsal
# (deploy/rehearsal/rehearse.sh). NOT a production image.
#
# Ubuntu 24.04 with the distro's own docker.io, docker-compose-v2 and nginx: the
# versions an unconfigured Ubuntu host gets from `apt install`, which is what P2
# Task 9 Step 2 would find or install. It runs its own dockerd (so it needs
# --privileged), and host nginx as a plain process: there is no systemd in a
# container, so /usr/local/bin/systemctl and journalctl are shims that drive nginx
# directly. Everything else explorers-deploy.sh calls is the real tool.
FROM ubuntu:24.04

ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      docker.io docker-compose-v2 nginx curl jq openssl ca-certificates sudo \
      iproute2 procps tini xz-utils \
 && rm -rf /var/lib/apt/lists/*

# The pre-deploy and scheduled backups (tunes/deployment/platform-backup.mjs) need
# Node 24 on the host; apt's nodejs is 18. Same version the workflow and image use.
ARG NODE_VERSION=24.21.0
RUN arch="$(dpkg --print-architecture)"; case "$arch" in amd64) arch=x64 ;; arm64) arch=arm64 ;; esac \
 && curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${arch}.tar.xz" \
    | tar -xJ -C /usr/local --strip-components=1 --exclude='*/include' --exclude='*/share' \
 && node --version

COPY systemctl journalctl rehearsal-db-head /usr/local/bin/
COPY entrypoint.sh /usr/local/sbin/standin-entrypoint
COPY legacy-site.conf /etc/nginx/sites-available/explorers-legacy
RUN chmod 0755 /usr/local/bin/systemctl /usr/local/bin/journalctl /usr/local/bin/rehearsal-db-head /usr/local/sbin/standin-entrypoint \
 && ln -s /etc/nginx/sites-available/explorers-legacy /etc/nginx/sites-enabled/explorers-legacy \
 && install -d -m 0755 /srv/legacy-spa \
 && printf '<!doctype html><title>legacy explorers SPA</title><p>legacy-spa-marker</p>\n' > /srv/legacy-spa/index.html

VOLUME /var/lib/docker
EXPOSE 80 443
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/sbin/standin-entrypoint"]
