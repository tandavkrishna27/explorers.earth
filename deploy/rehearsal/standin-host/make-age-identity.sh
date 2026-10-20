#!/usr/bin/env bash
# Rehearsal only: a throwaway age identity for the stand-in's backups, made with the
# same pinned image platform-backup.mjs encrypts with. In production the owner
# generates the identity on their own machine and only the public key reaches
# GitHub (the EXPLORERS_BACKUP_AGE_RECIPIENT variable), and from there the host.
set -euo pipefail
image="$(node -e 'import("/root/deploy/platform-backup.mjs").then(m => { m.ensureAgeImage(); console.log(m.AGE_IMAGE); })')"
install -d -m 0700 /root/rehearsal-keys
rm -f /root/rehearsal-keys/identity.age
docker run --rm --network none -v /root/rehearsal-keys:/keys --entrypoint age-keygen "$image" -o /keys/identity.age 2>/dev/null
recipient="$(sed -n 's/^# public key: //p' /root/rehearsal-keys/identity.age)"
[[ "$recipient" =~ ^age1[0-9a-z]{58}$ ]] || { echo "age-keygen gave no public key" >&2; exit 1; }
# Local-mode backups only: the rehearsal never contacts S3. The rehearsal's render
# step adds these two directories to the uploaded production.env.
install -d -m 0700 /var/backups/explorers /var/lib/explorers-media
echo "backup recipient $recipient"
