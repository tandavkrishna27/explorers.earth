# explorers.earth production configuration in GitHub

Every value the canonical stack needs lives in GitHub. Nothing is typed into a file on the host.
On every run, `.github/workflows/explorers.yml` does the following:

1. It renders `production.env` from the **`explorers-production` environment**
   (`deploy/render-production-env.sh`). Each value reaches the renderer only as an environment
   variable of that one step. No value is passed as an argument, echoed or traced.
2. It validates the file with `deploy/host/validate-production-env.sh` before any SSH connection.
   `explorers-bootstrap.sh check` runs the same script on the host. A failure names the variable
   and the rule, never the value.
3. It uploads the file with the release. `explorers-deploy.sh` installs it as
   `/opt/explorers/production.env`, root-owned and `0600`. It keeps the previous file as
   `production.env.previous` and shreds the uploaded copy.

Two things stay on the host and never leave it: the two database password files under
`/opt/explorers/secrets/`. `explorers-bootstrap.sh init` generates them, and `production.env`
names only their paths.

**This repository is public.** Never commit a value, a host name or an IP address. Every command
below reads its value from a prompt or from standard input, never from the command line, so no
value lands in shell history or in `ps` output. The examples use `<host>` for the deploy host,
`<owner>/<repo>` for this repository and `<bucket>` for the media bucket.

To change a value, update it in GitHub and run the deploy workflow again. If you edit
`/opt/explorers/production.env` by hand, the next deploy overwrites it.

---

## 0. Create the environment once

The deploy job already names `environment: explorers-production`. Create the environment, add
yourself as a required reviewer, and allow only `main` to deploy:

```bash
REPO=<owner>/<repo>
uid="$(gh api user --jq .id)"
gh api --method PUT "repos/$REPO/environments/explorers-production" --input - <<EOF
{"reviewers":[{"type":"User","id":$uid}],"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}
EOF
gh api --method POST "repos/$REPO/environments/explorers-production/deployment-branch-policies" -f name=main -f type=branch
gh api "repos/$REPO/environments/explorers-production" --jq '{name, protection_rules: [.protection_rules[].type]}'
```

The last command should list `required_reviewers` and `branch_policy`. You get the same result in
the web UI under Settings → Environments → New environment → Required reviewers, and Deployment
branches set to `main`.

Every `gh` command below runs from a clone of the repository, or with `--repo <owner>/<repo>`
added.

---

## 1. Environment secrets (`explorers-production`)

`gh secret set` with no `--body` prompts for the value and hides it, or reads it from a pipe.

| GitHub name | Becomes in `production.env` | What it is | Format / rule (validator) | Where to get it | Reuse an existing secret? |
|---|---|---|---|---|---|
| `EXPLORERS_AUTH_SECRET` | `EXPLORERS_AUTH_SECRET` | Better Auth signing secret | One plain value, at least 32 characters | `openssl rand -hex 32` | No. New random value |
| `MUSIC_GATE_ATTESTATION_KEY` | `MUSIC_GATE_ATTESTATION_KEY` | Signs the migration gate's attestation | One plain value, at least 32 characters | `openssl rand -hex 32` | No. New random value |
| `GOOGLE_CLIENT_SECRET` | `GOOGLE_CLIENT_SECRET` | Secret of the **production** OAuth client | Non-empty, no example value | Google Cloud console → APIs & Services → Credentials, on the production Web client (runbook section 1) | No. New production OAuth client |
| `GOOGLE_BOOKS_API_KEY` | `GOOGLE_BOOKS_API_KEY` | Books catalog search, called by the API server | Non-empty | Google Cloud console → Credentials | **Yes: the same value as `VITE_GOOGLE_BOOKS_API_KEY`**. GitHub cannot show a secret, so copy the key from the console. If that key is restricted by HTTP referrer, it will not work from the server. Use a key restricted to the Books API instead |
| `TMDB_ACCESS_TOKEN` | `TMDB_ACCESS_TOKEN` | Movies catalog search (TMDB API Read Access Token, a bearer token) | Non-empty | themoviedb.org → Settings → API → "API Read Access Token" | **Yes: the same value as `VITE_TMDB_ACCESS_TOKEN`**. Copy it from TMDB |
| `EXPLORERS_S3_ACCESS_KEY_ID` | `AWS_ACCESS_KEY_ID` | Access key of the media/backup IAM user | Non-empty, one plain value | AWS IAM → the new user → Security credentials → Create access key | No. **New IAM user** (permissions in runbook section 1). Never the repository's `AWS_ACCESS_KEY_ID`: that one is SES's, and the distinct name stops it from being picked up |
| `EXPLORERS_S3_SECRET_ACCESS_KEY` | `AWS_SECRET_ACCESS_KEY` | Secret half of that access key | Non-empty, one plain value | Shown once when the access key is created | No. Same new IAM user; never the repository's `AWS_SECRET_ACCESS_KEY` |

"One plain value" applies to every rendered value. It must be a single line with no whitespace, no
quotes, and no `$`, `#` or backslash. `docker compose --env-file` would otherwise change the value
silently.

```bash
E="--env explorers-production"
openssl rand -hex 32 | gh secret set $E EXPLORERS_AUTH_SECRET
openssl rand -hex 32 | gh secret set $E MUSIC_GATE_ATTESTATION_KEY
gh secret set $E GOOGLE_CLIENT_SECRET            # paste at the hidden prompt
gh secret set $E GOOGLE_BOOKS_API_KEY            # paste at the hidden prompt
gh secret set $E TMDB_ACCESS_TOKEN               # paste at the hidden prompt
gh secret set $E EXPLORERS_S3_ACCESS_KEY_ID      # paste at the hidden prompt
gh secret set $E EXPLORERS_S3_SECRET_ACCESS_KEY  # paste at the hidden prompt
gh secret list $E                                # names and dates only
```

Nobody needs to read the two random keys back, so pipe them straight into GitHub. Rotating either
one invalidates every session (`EXPLORERS_AUTH_SECRET`) or the current gate attestation
(`MUSIC_GATE_ATTESTATION_KEY`, regenerated on the next deploy).

---

## 2. Environment variables (`explorers-production`)

These are not secret, but they are configuration, so they live in the same environment.
`gh variable set` with no `--body` prompts for the value, or reads it from a pipe.

| GitHub name | Becomes in `production.env` | What it is | Format / rule (validator) | Where to get it | Reuse? |
|---|---|---|---|---|---|
| `GOOGLE_CLIENT_ID` | `GOOGLE_CLIENT_ID` | Client ID of the **production** OAuth client | `<digits>-<id>.apps.googleusercontent.com` | Same Credentials page as the secret | No. New production OAuth client |
| `EXPLORERS_MEDIA_S3_BUCKET` | `EXPLORERS_MEDIA_S3_BUCKET` | The private media bucket | The bucket name, not an ARN | AWS S3 console | No. New private bucket (runbook section 1) |
| `EXPLORERS_MEDIA_S3_REGION` | `EXPLORERS_MEDIA_S3_REGION` | That bucket's region | An AWS region code, e.g. `ap-south-1` | AWS S3 console → bucket → Properties | n/a |
| `EXPLORERS_BACKUP_AGE_RECIPIENT` | `EXPLORERS_BACKUP_AGE_RECIPIENT` | Public half of the owner's backup identity | `age1` + 58 lowercase letters/digits. Never the `AGE-SECRET-KEY-…` identity | `age-keygen -o explorers-backup.age` **on your own machine**, then `age-keygen -y explorers-backup.age` | No. Generated by you; keep the identity offline |
| `EXPLORERS_TRUSTED_PROXY_IP` *(optional)* | `EXPLORERS_TRUSTED_PROXY_IP` | The egress network gateway that host nginx reaches the API from | One IPv4 address, not a CIDR | Leave unset for the first deploy, which then uses `172.18.0.1`, the guess in `deploy/production.env.example`. The deploy warns with the real address; set it and redeploy (runbook step 5.3) | n/a |

```bash
E="--env explorers-production"
gh variable set $E GOOGLE_CLIENT_ID              # paste at the prompt
gh variable set $E EXPLORERS_MEDIA_S3_BUCKET
gh variable set $E EXPLORERS_MEDIA_S3_REGION
age-keygen -y explorers-backup.age | gh variable set $E EXPLORERS_BACKUP_AGE_RECIPIENT
# After the first deploy, with the address from its warning:
gh variable set $E EXPLORERS_TRUSTED_PROXY_IP
gh variable list $E
```

The renderer derives or fixes everything else in `production.env`:

| `production.env` name | Value |
|---|---|
| `EXPLORERS_PUBLIC_ORIGIN` | `https://${EXPLORERS_SERVER_NAME}` (repository variable below) |
| `DB_NAME`, `DB_MIGRATOR_USER`, `DB_RUNTIME_USER` | `explorers`, `explorers_migrator`, `explorers_runtime` |
| `DB_MIGRATOR_PASSWORD_FILE_HOST`, `DB_RUNTIME_PASSWORD_FILE_HOST` | `/opt/explorers/secrets/db-migrator`, `/opt/explorers/secrets/db-runtime`. The files are generated on the host by `explorers-bootstrap.sh init` |
| `EXPLORERS_API_IMAGE_NAME`, `EXPLORERS_API_DIGEST`, `EXPLORERS_API_COMMIT` | The placeholders from `deploy/production.env.example`. Every deploy overrides them with the verified digest |

---

## 3. Repository variables (already used by the workflow)

These are unchanged. They are repository variables (Settings → Secrets and variables → Actions →
Variables). The workflow would also read them if they were set on the environment instead.

| GitHub name | What it is | Format | Where to get it | Reuse? |
|---|---|---|---|---|
| `EXPLORERS_SERVER_NAME` | The one public hostname | e.g. `explorers.earth` or `www.explorers.earth`, whichever you chose (runbook section 1) | Your DNS decision | n/a |
| `EXPLORERS_PUBLIC_JSON` | The production `public.json` the SPA reads at runtime | One line of JSON whose `origin` is `https://$EXPLORERS_SERVER_NAME` | One-liner below | **The Maps key inside it (`mapsBrowserKey`) has the same value as the `VITE_GOOGLE_MAPS_API_KEY` secret**, if that key is restricted by HTTP referrer to `https://<host>/*`. Otherwise create a browser key that is |
| `EXPLORERS_TLS_CERTIFICATE`, `EXPLORERS_TLS_CERTIFICATE_KEY` | Certificate paths on the host | e.g. `/etc/letsencrypt/live/<host>/fullchain.pem`, `privkey.pem` | certbot on the host | n/a |
| `EXPLORERS_NGINX_SITE_PATH` | The nginx file that serves the host name today | A path under `/etc/nginx/` | `explorers-bootstrap.sh check` names it (runbook 2.4) | n/a |

`EXPLORERS_PUBLIC_JSON` for explorers.earth. If you chose `www`, use `https://www.explorers.earth`
as the origin. The Maps key is read at a hidden prompt and never appears on a command line:

```bash
read -rsp 'Google Maps browser key: ' k; echo
printf '%s\n' "$k" | jq -cR '{version:1,environment:"production",origin:"https://explorers.earth",apiPath:"/api",socketPath:"/socket.io",mapsBrowserKey:.,analytics:{enabled:false}}' | gh variable set EXPLORERS_PUBLIC_JSON
unset k
gh variable set EXPLORERS_SERVER_NAME            # explorers.earth (or www.explorers.earth)
gh variable set EXPLORERS_TLS_CERTIFICATE
gh variable set EXPLORERS_TLS_CERTIFICATE_KEY
gh variable set EXPLORERS_NGINX_SITE_PATH
```

---

## 4. Repository secrets for SSH

| GitHub name | What it is | Format | Where to get it | Reuse? |
|---|---|---|---|---|
| `EXPLORERS_DEPLOY_HOST` | The explorers host | Host name or address | Your provider | **Yes: already set**. Reuse it |
| `EXPLORERS_DEPLOY_USER` | The deploy user, with passwordless `sudo` | A login name | The host | **Yes: already set**. Reuse it |
| `EXPLORERS_DEPLOY_KEY` | Private half of a key pair used for nothing else | OpenSSH private key | `ssh-keygen -t ed25519` | **Yes: already set**. Reuse it |
| `EXPLORERS_DEPLOY_KNOWN_HOSTS` | The host's pinned SSH host key | One `known_hosts` line | `ssh-keyscan`, verified out of band (below) | **No. New** |
| `DEPLOY_PORT` *(optional)* | SSH port if not 22 | A number | The host | Reuse if already set |

```bash
ssh-keyscan -t ed25519 <host> > known_hosts.explorers 2>/dev/null
ssh-keygen -lf known_hosts.explorers   # compare with the fingerprint in the provider's console
gh secret set EXPLORERS_DEPLOY_KNOWN_HOSTS < known_hosts.explorers
rm known_hosts.explorers
```

---

## 5. What the deploy checks, and what a failure looks like

The render step fails the job before any SSH connection in these cases:

- **A secret or variable is not set.** The error reads
  `::error::Environment secret EXPLORERS_S3_ACCESS_KEY_ID is not set in explorers-production.`
- **A value spans more than one line.** The error reads
  `::error::GOOGLE_CLIENT_SECRET must be a single line`.
- **A rule fails.** The step prints one `FAIL: production.env: <NAME> <rule>` line per problem,
  using the `production.env` name from the tables above. The rules are the same ones the host
  bootstrap checks:
  - every required variable is non-empty, set once, and holds no example value
  - every value is one plain value
  - `EXPLORERS_PUBLIC_ORIGIN` is exactly `https://<EXPLORERS_SERVER_NAME>`
  - the auth secret and the attestation key are at least 32 characters
  - the two database users differ, are plain lowercase identifiers, and are not `postgres` or
    `music_runtime`
  - the password-file paths are absolute
  - `EXPLORERS_BACKUP_AGE_RECIPIENT` is an age public key
  - `EXPLORERS_TRUSTED_PROXY_IP` is one IPv4 address

GitHub also masks every secret value in the log. The renderer never prints one either way.
