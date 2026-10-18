#!/usr/bin/env bash
# Rehearsal only: a throwaway age identity for the stand-in's backups, made with the
# same pinned image platform-backup.mjs encrypts with. In production the owner
# generates the identity on their own machine and only the public key reaches the
# host (EXPLORERS_BACKUP_AGE_RECIPIENT).
set -euo pipefail
image="$(node -e 'import("/root/deploy/platform-backup.mjs").then(m => { m.ensureAgeImage(); console.log(m.AGE_IMAGE); })')"
install -d -m 0700 /root/rehearsal-keys
rm -f /root/rehearsal-keys/identity.age
docker run --rm --network none -v /root/rehearsal-keys:/keys --entrypoint age-keygen "$image" -o /keys/identity.age 2>/dev/null
recipient="$(sed -n 's/^# public key: //p' /root/rehearsal-keys/identity.age)"
[[ "$recipient" =~ ^age1[0-9a-z]{58}$ ]] || { echo "age-keygen gave no public key" >&2; exit 1; }
env_file=/opt/explorers/production.env
sed -i "s|^EXPLORERS_BACKUP_AGE_RECIPIENT=.*|EXPLORERS_BACKUP_AGE_RECIPIENT=$recipient|" "$env_file"
# Local-mode backups only: the rehearsal never contacts S3.
install -d -m 0700 /var/backups/explorers /var/lib/explorers-media
grep -q '^EXPLORERS_BACKUP_LOCAL_DESTINATION=' "$env_file" || printf 'EXPLORERS_BACKUP_LOCAL_DESTINATION=/var/backups/explorers\nEXPLORERS_MEDIA_LOCAL_ROOT=/var/lib/explorers-media\n' >> "$env_file"
echo "backup recipient $recipient"
