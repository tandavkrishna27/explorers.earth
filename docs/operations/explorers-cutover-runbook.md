# explorers.earth cutover runbook

Moves explorers.earth onto the canonical stack: host nginx serving the SPA, and the canonical API
plus PostgreSQL in compose, all on the explorers host. This is P2 Tasks 9 and 10 of
[the P2 plan](../superpowers/plans/2026-10-18-p2-cutover-to-canonical.md), written after a full
dress rehearsal on a local stand-in host. Every command below ran there, in this order.

**Settled before you start.** We start fresh, so the new database begins empty and nothing is
imported. Production Strapi holds only test and team data. There are no real users, so there is
no user communication and no handle hold.

**Re-run the rehearsal** after any change to `deploy/`, the workflow or the migrations. It needs
Docker and Node, takes about 3 minutes once the images are cached, and leaves the stand-in running for inspection until
`bash deploy/rehearsal/rehearse.sh down` removes it:

```bash
bash deploy/rehearsal/rehearse.sh all
```

It writes `.rehearsal/transcript.log` (every command with its output) and
`.rehearsal/timings.tsv`. How the stand-in works is described at the top of
`deploy/rehearsal/rehearse.sh`.

---

## 0. Blockers to clear before cutover day

These came out of the rehearsal. The PR that added this runbook lists them as gaps; this
section says what each one means for the cutover.

1. **Fixed (#144): publishing the image no longer deploys to the Music host.** `explorers.yml`
   needs a digest that `tunes.yml`'s `publish-image` job attested. `tunes.yml` now has two
   separate dispatch inputs: `publish_image` runs `publish-image` only and never reaches
   `deploy-production` or `tunes-deploy.yml`; `deploy_music` is what deploys to the live Music
   host. **For the explorers cutover, tick `publish_image` only. Never tick `deploy_music`.**
2. **The committed drill receipt is one migration behind, so every deploy after the first is
   refused.** The deploy gate (#141) admits a deploy over an existing database only if
   `docs/replatform/evidence/recovery-receipt.json` was drilled at the database's migration
   head. The committed receipt is at `0056_explorers_app_enrichment_jobs`; the database will be at
   `0060_explorers_guide_budget_tier`, the head of `tunes/migrations/` and the compose file's
   migration marker. The rehearsal (run when `main` was at 0057) ran the gate on its own backup and
   got `DRILL_MARKER_MISMATCH` with the committed receipt and `admitted` with a fresh drill at the
   head. This matters on cutover day: if the first deploy migrates and then fails at `activate`, the
   re-run is no longer a first deploy and is refused. That includes a rollback, and the redeploy
   that sets the trusted proxy (step 5.3). **Before cutover, re-run the fixture drill at 0060**
   (`docs/replatform/release-and-recovery.md`, "The monthly drill", fixture form) **and commit the
   receipt.** It goes stale after 30 days, so do it close to cutover.
3. **Better Auth's rate limiter cannot see client addresses.** On the first request the API logs
   `Rate limiting could not determine a client IP and is falling back to a single shared
   per-path bucket`. `EXPLORERS_TRUSTED_PROXY_IP` fixes Express (`req.ip`), but Better Auth reads
   its own setting. Until `advanced.ipAddress.ipAddressHeaders: ["x-real-ip"]` is set in
   `tunes/server/auth/betterAuth.ts`, everyone shares one bucket on `/api/auth/*`. That is safe
   only because nginx overwrites `X-Real-IP` and the API is published on loopback alone.
   Accept this for launch, or fix it first.

---

## 1. Prerequisites the owner must have

Collect all of these before cutover day. **Nothing in this list goes into the repository.** The
repo is public, so host addresses, keys and the captured nginx config stay out of it. Every
application value goes into the `explorers-production` GitHub environment instead, and every
deploy renders `/opt/explorers/production.env` from it. Nobody edits that file by hand.
[explorers-github-configuration.md](explorers-github-configuration.md) has each name, its format,
where to get it and the exact `gh` command.

### Access

- [ ] **SSH to the explorers host** as a deploy user with passwordless `sudo`.
- [ ] That host's **SSH host key**, verified out of band (`ssh-keyscan -t ed25519 <host>`, then
      compare the fingerprint with the provider's console). This becomes
      `EXPLORERS_DEPLOY_KNOWN_HOSTS`.
- [ ] A **deploy SSH key pair** that is used for nothing else. The public half goes in the deploy
      user's `authorized_keys`; the private half becomes `EXPLORERS_DEPLOY_KEY`.
- [ ] GitHub admin on `tandavkrishna27/explorers.earth`, to set variables, secrets and the
      `explorers-production` environment.

### DNS and TLS

- [ ] **Choose `www` or the apex** (P2 open question 4). It has to be one origin, and the other
      must 301 to it. Every later value uses this one name: `<host>` below.
- [ ] DNS for `<host>` points at the explorers host. If that host already serves the SPA today,
      DNS is already right and the cutover is the nginx switch in step 5.4. If it is a new
      machine, see [section 4](#4-the-dnstraffic-switch).
- [ ] A **TLS certificate for `<host>`** on the host, e.g. from certbot, at
      `/etc/letsencrypt/live/<host>/fullchain.pem` and `privkey.pem`. The deploy checks the site
      over HTTPS on 127.0.0.1, so a certificate must exist before the first deploy.

### Google OAuth (production client)

In Google Cloud console → APIs & Services → Credentials, on a **Web application** client:

- [ ] Authorised JavaScript origin: `https://<host>`
- [ ] Authorised redirect URI: `https://<host>/api/auth/callback/google`. This is exact: Better
      Auth builds it from `EXPLORERS_PUBLIC_ORIGIN`.
- [ ] The OAuth consent screen is **published** (not "Testing"), or only listed test users can
      sign in.
- [ ] The client ID becomes the `explorers-production` environment variable `GOOGLE_CLIENT_ID`,
      and the client secret becomes the environment secret `GOOGLE_CLIENT_SECRET`.

### S3 (private media)

- [ ] A **private** bucket in the region you will set as `EXPLORERS_MEDIA_S3_REGION`, with
      public access blocked. No CORS rule is needed: uploads go through the API, never straight
      from the browser to S3.
- [ ] An IAM user limited to `s3:GetObject`, `s3:PutObject` and `s3:DeleteObject` on
      `arn:aws:s3:::<bucket>/prod/*`. Its access key becomes the environment secrets
      `EXPLORERS_S3_ACCESS_KEY_ID` and `EXPLORERS_S3_SECRET_ACCESS_KEY`, which the deploy writes as
      `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`. The names differ on purpose: the repository's
      own `AWS_*` secrets belong to SES. Nothing checks these keys at boot. Wrong keys show up only
      when the first upload fails (step 6.2).

### Backups (#141)

- [ ] An **age identity on your own machine**, never on the host. `age-keygen -o explorers-backup.age`
      writes it and prints `# public key: age1...`. Keep a second copy of the identity offline.
      Without it no backup can be decrypted. The public key (`age-keygen -y explorers-backup.age`)
      becomes the environment variable `EXPLORERS_BACKUP_AGE_RECIPIENT`.
- [ ] The S3 IAM user above also needs `s3:ListBucket` on the bucket, limited to the
      `prod/backups/` prefix, so backups can be pruned. Whether it may also delete under
      `prod/backups/` is owner decision 2 in
      [the backup plan](../superpowers/plans/2026-10-18-backup-restore-recovery.md). If it may not,
      backups accumulate and report `BACKUP_DELETE_PERMISSION_UNAVAILABLE`.
- [ ] **Node 24 on the host.** The pre-deploy and nightly backups run `platform-backup.mjs` with it.
- [ ] Your own AWS credentials with read access to `prod/backups/`, for the monthly drill on your
      machine.

### Third-party keys

- [ ] A Google Maps **browser** key, restricted by HTTP referrer to `https://<host>/*`. It goes in
      `EXPLORERS_PUBLIC_JSON`, never in `production.env`.
- [ ] `GOOGLE_BOOKS_API_KEY` and `TMDB_ACCESS_TOKEN`. Today they are the GitHub secrets
      `VITE_GOOGLE_BOOKS_API_KEY` and `VITE_TMDB_ACCESS_TOKEN`, used by the old frontend build.
      The same values become environment secrets under the new names. GitHub cannot show a
      secret, so copy each value from its provider. The deploy refuses to run if either is
      missing.

### The secrets list, by name

Everything is in GitHub. The tables in
[explorers-github-configuration.md](explorers-github-configuration.md) give the format, the source
and the `gh` command for each name.

**GitHub environment `explorers-production`**. Create it with yourself as a required reviewer.
That gives a second human gate after the typed `replace-explorers-host`.

| Kind | Names |
|---|---|
| Environment secrets | `EXPLORERS_AUTH_SECRET`, `MUSIC_GATE_ATTESTATION_KEY` (both `openssl rand -hex 32`), `GOOGLE_CLIENT_SECRET`, `GOOGLE_BOOKS_API_KEY`, `TMDB_ACCESS_TOKEN`, `EXPLORERS_S3_ACCESS_KEY_ID`, `EXPLORERS_S3_SECRET_ACCESS_KEY` |
| Environment variables | `GOOGLE_CLIENT_ID`, `EXPLORERS_MEDIA_S3_BUCKET`, `EXPLORERS_MEDIA_S3_REGION`, `EXPLORERS_BACKUP_AGE_RECIPIENT` (the age **public** key; every deploy after the first refuses without it), and `EXPLORERS_TRUSTED_PROXY_IP`, which stays unset until step 5.3 |

**GitHub repository variables** (Settings → Secrets and variables → Actions → Variables):
`EXPLORERS_PUBLIC_JSON`, `EXPLORERS_SERVER_NAME`, `EXPLORERS_TLS_CERTIFICATE`,
`EXPLORERS_TLS_CERTIFICATE_KEY`, `EXPLORERS_NGINX_SITE_PATH`.

**GitHub repository secrets:** `EXPLORERS_DEPLOY_HOST`, `EXPLORERS_DEPLOY_USER` and
`EXPLORERS_DEPLOY_KEY` are already set. `EXPLORERS_DEPLOY_KNOWN_HOSTS` is new. `DEPLOY_PORT` is
optional.

**Derived by the deploy, not set anywhere:**

- `EXPLORERS_PUBLIC_ORIGIN` = `https://<EXPLORERS_SERVER_NAME>`
- `DB_NAME`, `DB_MIGRATOR_USER`, `DB_RUNTIME_USER` = `explorers`, `explorers_migrator`,
  `explorers_runtime`
- The two password-file paths, under `/opt/explorers/secrets/`
- The image placeholders

**On the host, and only there:** the two database password files. `explorers-bootstrap.sh init`
generates them, and they never leave the host.

---

## 2. Host bootstrap (P2 Task 9), once

Copy `deploy/` from the commit you will deploy to the host (for example
`scp -r deploy <user>@<host>:~/deploy`), then on the host:

**2.1 Save what nginx serves today.** It stays on the host and is never committed.

```bash
sudo nginx -T > ~/nginx-T-before-cutover.txt
```

**2.2 Bootstrap.** This checks Docker, compose, nginx, disk and memory, creates `/opt/explorers`
(`0700`) and `/srv/explorers`, and generates the two database password files. Then it runs the
checks in 2.4. It does not create `production.env`. The first deploy writes that file from GitHub.

```bash
sudo bash ~/deploy/host/explorers-bootstrap.sh init <host>
```

Expected: `ok:` lines for the tools, `ok:   generated /opt/explorers/secrets/db-migrator` (and
`db-runtime`), the same lines as 2.4, and exit code 0.

**2.3 Set the `explorers-production` environment.** Follow
[explorers-github-configuration.md](explorers-github-configuration.md) sections 0–2, on your own
machine and not on the host. Those sections create the environment and its required reviewer, then
set every secret and variable in section 1. Pipe the two random values straight into GitHub; nobody
needs to see them:

```bash
openssl rand -hex 32 | gh secret set --env explorers-production MUSIC_GATE_ATTESTATION_KEY
openssl rand -hex 32 | gh secret set --env explorers-production EXPLORERS_AUTH_SECRET
```

Leave `EXPLORERS_TRUSTED_PROXY_IP` unset; step 5.3 sets it. Nothing is edited on the host.

**2.4 Check.** Repeat until it passes:

```bash
sudo bash ~/deploy/host/explorers-bootstrap.sh check <host>
```

Expected, ending in `host is ready for the first deploy`:

```
ok:   Docker version 29.1.3, ...; Docker Compose version 2.40.3...
ok:   nginx version: nginx/1.24.0 (Ubuntu)
ok:   node v24.21.0
ok:   ...G free under /var/lib/docker
ok:   ...MB memory available
ok:   /opt/explorers (0700) and /srv/explorers exist
ok:   /opt/explorers/production.env does not exist yet: the first deploy writes it from the explorers-production GitHub environment
ok:   nginx serves <host> from /etc/nginx/sites-enabled/<file>: set EXPLORERS_NGINX_SITE_PATH to that path
```

After the first deploy the same check validates the installed file with
`deploy/host/validate-production-env.sh`, which is also the workflow's validator. It then prints
`ok:   /opt/explorers/production.env is complete`. A `FAIL:` line names the variable and the
rule. Fix the value in GitHub and deploy again.

The last line answers P2 open question 1: it names the file that serves `<host>` today. Set
`EXPLORERS_NGINX_SITE_PATH` to that file. **If it is a symlink in `sites-enabled/`, use the
link's target in `sites-available/`**, so the deploy replaces the file and keeps the link.
If you pick a different file, the deploy finds two files claiming `<host>`, refuses, and puts
everything back. The rehearsal checks that this happens.

You do not create any database role by hand. The postgres image creates the migrator as a
superuser from `DB_MIGRATOR_USER`; migration 0010 creates `music_runtime`; the migration gate
creates the runtime login. **Do not create a database** either: compose makes an empty one on
first start.

**2.5 Set the repository variables and the SSH secrets** from section 1
([explorers-github-configuration.md](explorers-github-configuration.md) sections 3–4).
`EXPLORERS_NGINX_SITE_PATH` is the file 2.4 named. `EXPLORERS_DEPLOY_KNOWN_HOSTS` is the one new
SSH secret. `EXPLORERS_PUBLIC_JSON` is one line:

```json
{"version":1,"environment":"production","origin":"https://<host>","apiPath":"/api","socketPath":"/socket.io","mapsBrowserKey":"<browser key>","analytics":{"enabled":false}}
```

The configuration page has the one-liner that builds it for explorers.earth and reads the Maps key
at a hidden prompt.

The deploy workflow fails before any SSH connection if any of these is missing or breaks a rule.

---

## 3. Go / no-go

Go only when every box is ticked.

- [ ] Section 0, blocker 1 is fixed (#144 merged): `tunes.yml` on `main` has the separate
      `publish_image` and `deploy_music` inputs, so publishing the image cannot deploy to the
      Music host.
- [ ] Section 0, blocker 2 is fixed: `recovery-receipt.json` on `main` was drilled at the
      migration head this deploy brings (today `0060_explorers_guide_budget_tier`) less than 30 days ago.
- [ ] Every name in section 1 is set: `gh secret list --env explorers-production` and
      `gh variable list --env explorers-production` show them, and the environment has you as a
      required reviewer.
- [ ] `bash deploy/rehearsal/rehearse.sh all` passed on the exact commit you will deploy.
- [ ] `explorers-bootstrap.sh check <host>` passes on the host, today.
- [ ] `~/nginx-T-before-cutover.txt` exists on the host.
- [ ] `main` CI is green for the commit: a successful `ci.yml` push run (job `replatform-required`)
      and a successful `test.yml` push run (job `music-required`), both on that SHA. Note their
      run IDs.
- [ ] Google console shows the redirect URI exactly as in section 1.
- [ ] Someone can watch the Strapi-backed SPA during the switch and has SSH open, to take the
      rollback in section 7 by hand if needed.

---

## 4. The DNS/traffic switch

**Same host as today (expected).** There is no DNS change. The switch is the moment
`explorers-deploy.sh activate` swaps the nginx site file and reloads, inside the deploy
workflow (step 5.4). Before that, visitors get the old SPA, which still talks to Strapi. After
it, they get the new SPA on the canonical API. The API container starts earlier (step 5.2), but
nothing routes to it until the switch.

**A new host.** Do everything in sections 2–5 against the new host while DNS still points at
the old one. Get the certificate with a DNS-01 challenge (`certbot certonly --manual
--preferred-challenges dns -d <host>`), because HTTP-01 cannot reach the new host yet. In the
deploy, the HTTPS check uses `--resolve <host>:443:127.0.0.1` and never touches DNS, so it
passes. Lower the record's TTL to 300 a day ahead. Run the probe in step 6.1 with
`--connect <new-host-ip>:443` before switching. Then change the A/AAAA record. Rollback is
changing it back.

---

## 5. Cutover, in order

**5.1 Publish the image.** In GitHub: Actions → `tunes.yml` → Run workflow on `main`, with
**`publish_image` ticked and `deploy_music` left unticked**, and the two run IDs from section 3.
Ticking `deploy_music` would also redeploy the legacy Music host through `tunes-deploy.yml`;
never tick it during the explorers cutover. When it finishes, copy the digest from the `publish-image` job's
"Push and expose registry digest" step: the `docker push` output ends with
`digest: sha256:<64 hex>`.

**5.2 Deploy.** Actions → "Deploy explorers.earth (canonical)" → Run workflow on `main`:
`confirm_cutover` = `replace-explorers-host`, `image_digest` = the digest. Approve the
`explorers-production` environment when it asks.

The workflow's host steps, in order:

- "Render and validate production.env from the explorers-production environment" runs before
  any host step. Expect `::notice::Environment variable EXPLORERS_TRUSTED_PROXY_IP is not set;
  using 172.18.0.1...` and `production.env: every rule passes`. It prints no values.
- "Upload the release": no output on success.
- "Take a pre-deploy backup on the host": `installed production.env from the
  explorers-production environment (previous kept as /opt/explorers/production.env.previous)`,
  then `no migrated canonical database on this host yet; nothing to back up`. On any later deploy
  this is a real backup to S3.
- "Refuse the deploy without recovery evidence": on the first deploy, the notice
  `The host has no migrated canonical database yet; the first deploy has nothing to back up.`
  On later deploys this is the gate from section 0, blocker 2.
- "Stage the API": expect

```
image migration head: 0060_explorers_guide_budget_tier; database migration head: <none, fresh database>
 ... migrate-1 Exited ... api-1 Healthy
API ready: ghcr.io/tandavkrishna27/explorers-tunes@sha256:...
recorded the running image in /opt/explorers/image.env
::warning::first deploy: EXPLORERS_TRUSTED_PROXY_IP is '172.18.0.1' but nginx reaches the API from '172.x.0.1'. Set the explorers-production environment variable EXPLORERS_TRUSTED_PROXY_IP to 172.x.0.1 and redeploy (docs/operations/explorers-cutover-runbook.md, step 5.3)
```

In "API acceptance checks", expect four `ok` lines: `/health/ready -> 200`,
`/api/explorers/v1/me -> 401`, `/api/auth/get-session -> 200`, and the `no-store` check.

In "Switch the SPA and the nginx site", expect `backed up <site> to
/srv/explorers/nginx-backups/...`, `nginx: configuration file ... test is successful`, and
`release <sha> is live`. **From here the new site is live** (section 4).

**5.3 Set the trusted proxy (P2 Task 9 Step 9).** Copy the address from the warning. On your own
machine, set the variable:

```bash
gh variable set --env explorers-production EXPLORERS_TRUSTED_PROXY_IP   # the address from the warning
```

Then **redeploy**. Run the workflow again exactly as in 5.2: the same `image_digest` and
`replace-explorers-host`. The render step now writes the real address, and `stage` recreates the
API with it. The database is migrated now, so this run is a later deploy:

- it takes a real pre-deploy backup to S3
- it needs the drill receipt from section 0, blocker 2

Do not edit `/opt/explorers/production.env` on the host. The next deploy would overwrite the edit.

Expect a short API outage while `stage` replaces the container. A same-schema redeploy in the
rehearsal (section 9) gave at most 2.5s of 503s. Re-running the one-shot migration gate is a
no-op at the same head.

Do not use the plan's `docker inspect -f '{{range .NetworkSettings.Networks}}{{.Gateway}}{{end}}'`.
The API is on two networks, so that prints `172.20.0.1invalid IP`. The deploy prints the right
address. Every later deploy **refuses** if the variable and the gateway differ, because that means
Docker re-created the network. Set the variable to the new address and deploy again.

To prove it took effect, run this on the host: two `X-Forwarded-For` values sent straight to
the API must get separate rate-limit buckets.

```bash
for ip in 198.51.100.1 198.51.100.2; do curl -s -D - -o /dev/null -H "Host: <host>" -H "X-Forwarded-For: $ip" http://127.0.0.1:5000/api/explorers/v1/profiles/no-such-handle | grep -i '^ratelimit:'; done
```

Expected: both lines show the same `remaining=`. One lower than the other means trust-proxy is
not live.

**5.4 Apply the Places taxonomy (P2 Task 10 Step 2).** On the host:

```bash
C="sudo docker compose -f /opt/explorers/production.compose.yml --env-file /opt/explorers/production.env --env-file /opt/explorers/image.env"
$C run --rm --no-deps migrate node dist/apply-reviewed-taxonomy.js --dry-run
$C run --rm --no-deps migrate node dist/apply-reviewed-taxonomy.js --apply --reviewed-by "<your name>"
```

Expected dry run: `"observedCatalogVersion":0,"catalogVersion":1,"changed":true,
"operations":{"defaultLocale":1,"sourceMappings":1,"term:add":335},"conflicts":[]`. The apply
prints the same with `"mode":"apply"` and a `receiptId`. Running the apply again prints
`"changed":false`; that is safe.

The plan's command, `docker compose -f /opt/explorers/production.compose.yml run --rm migrate
node dist/scripts/apply-reviewed-taxonomy.js`, fails twice over: without `--env-file`, compose
cannot render the file, and the bundle is `dist/apply-reviewed-taxonomy.js`.

---

## 6. Post-cutover verification

**6.1 Probe from outside**, on any machine with the repository and `npm ci` done at the root:

```bash
node node_modules/tsx/dist/cli.mjs deploy/rehearsal/probe.mts --origin https://<host> --google-client-id <GOOGLE_CLIENT_ID>
node deploy/rehearsal/spa-smoke.mjs https://<host>
```

Expected (the rehearsal's output):

```
ok   verifyCanonicalIngress - 7 probes; hidden-category target rehearsal-no-such-handle/places
ok   Google sign-in starts and names this origin's callback - redirect_uri https://<host>/api/auth/callback/google
ok   CSP and security headers as served - maps origins in CSP: true
ok   runtime-config.json is what the SPA will accept - environment production
ok   unknown handle is 404, not 200 {}
ok   legacy paths answer from the API, not the SPA shell - /graphql 410, /socket.io/ 404, /api/proxy-image 410, /sitemap.xml 200, /robots.txt 200
all checks passed
ok   / rendered (...)
ok   Google sign-in reaches accounts.google.com with redirect_uri https://<host>/api/auth/callback/google (aborted there)
SPA smoke passed
```

The SPA smoke check stops before contacting Google. `spa-smoke.mjs` needs `npm ci` in
`explorers-earth/` as well, for Playwright.

**6.2 By hand (P2 Task 10 Step 4).** The rehearsal could not do these.

- [ ] Sign in with Google end to end. In devtools, the cookie is
      `__Secure-better-auth.session_token`, with `Secure`, `HttpOnly` and `SameSite=Lax`.
- [ ] Upload a profile photo. This is the first real test of the S3 keys.
- [ ] Load a public profile: place category labels render (taxonomy), and a map shows tiles
      (Maps key and CSP).
- [ ] Create one recommendation in each category.
- [ ] Hide one category on your profile, then re-run 6.1 with
      `--hidden-handle <your handle> --hidden-category <that category>`. This is the real proof
      that the privacy gate is live; before any account exists, the probe can only use a handle
      that does not exist.

**6.3 Watch for the four failures that look like success** (P2 Task 10 Step 6): `/health/live`
200 while media is broken (probe a real media URL); `200 {}` for an unknown handle (6.1 checks
it); maps working only from your cache (use a private window); a stale `index.html` (6.1 checks
`no-store`).

**6.4 First backup and restore drill: before sign-ups open.** Do this after 6.2 and before
anyone outside the team signs up. Rehearsed (section 9); mechanism and full procedure in
[release-and-recovery.md](../replatform/release-and-recovery.md).

1. Install the nightly backup (02:17 UTC). The deploy already put `platform-backup.mjs` in
   `/opt/explorers/`. Copy `tunes/deployment/platform-backup.cron` to the host as
   `~/platform-backup.cron`, then:

   ```bash
   sudo install -m 0644 -o root -g root ~/platform-backup.cron /etc/cron.d/explorers-backup
   ```
2. Take the first backup by hand:

   ```bash
   sudo node /opt/explorers/platform-backup.mjs --environment prod --reason manual
   ```

   Expected: three JSON lines, `"stage":"snapshot","migrationMarker":"0060_explorers_guide_budget_tier",...`,
   `"stage":"media","objects":<n>`, and `"stage":"published","manifestKey":"prod/backups/<stamp>-manual-<run>/manifest.json",...`.
   Exit 0. Anything else means there is no backup. Do not open sign-ups.
3. On your machine, download that `manifest.json` and run the drill with your identity:

   ```bash
   npm run platform:restore-drill -- --manifest <manifest.json> --identity <your age identity> --receipt <TEMP>/platform-restore-drill-<8+ letters> --keep-archive
   ```

   Expected: a last line `{"drill":"...","result":"passed","recoveryMilliseconds":<n>,"receipt":"..."}`.
   It restores into a disposable PostgreSQL on your machine, boots the canonical app against it,
   and removes both. The recovery time to plan around is `recoveryMilliseconds` plus the
   download.
4. Commit the receipt as `docs/replatform/evidence/recovery-receipt.json` (and the run in
   `docs/replatform/evidence/milestone-3.md`), then merge it. Until it is on `main`, every deploy
   (rollbacks included) is refused once its marker or its 30 days run out.

---

## 7. Rollback decision tree

The schema only moves forward. **Rolling back restores an image, never a schema.** There are no
down-migrations, and an image older than the database is refused before it starts.

```
Where did it fail?
│
├─ Before "Switch the SPA" (stage or acceptance checks)
│    Visitors still get the old SPA. Nothing routes to the new API.
│    → Read the step's output: compose logs are printed. Fix, then re-run the workflow.
│      Nothing to roll back.
│
├─ In "Switch the SPA" (nginx -t, reload, or the HTTPS check)
│    activate puts the previous site file and release back by itself
│    ("previous site and release restored").
│    → Confirm that the old SPA is serving, then fix and re-run.
│
├─ After the switch, on the FIRST deploy (the new app misbehaves)
│    The way back is the old site file, which still points at Strapi.
│    → On the host:
│        ls /srv/explorers/nginx-backups/
│        sudo cp -p /srv/explorers/nginx-backups/<site file>.<stamp> <EXPLORERS_NGINX_SITE_PATH>
│        sudo nginx -t && sudo systemctl reload nginx
│      Leave the canonical stack running; nothing reaches it. Accounts created in
│      the meantime stay in the new database. Fix forward and deploy again.
│
├─ After the switch, on a LATER deploy
│    Every later deploy, a rollback included, first takes a pre-deploy backup
│    and needs a passing drill receipt at the database's head, under 30 days
│    old (DRILL_MARKER_MISMATCH / DRILL_STALE otherwise: run 6.4 steps 3-4).
│    ├─ No migration between the two commits
│    │    → Re-run the workflow with the previous commit's digest. Rehearsed
│    │      (v2 → v1): 21s, at most 2.5s of API 503s, journal unchanged.
│    └─ A migration came in between
│         The deploy refuses: "image bundles migrations up to X but the database
│         is at Y; refusing an older image". The host is left exactly as it was,
│         compose file included. Rehearsed (v3 one migration ahead → v1, when
│         main's head was 0057).
│         → Fix forward. Forcing the old image is pointless: its migration gate
│           exits with "unknown future migration in journal" and the API never
│           starts (rehearsed; the journal stayed at 0058).
│
└─ The database itself is damaged or lost
     → "Data restore on production" or "Host loss" in release-and-recovery.md.
       The restore itself was rehearsed with the drill (section 9: 6.1s from an
       encrypted backup to a booted app); the production swap steps were not.
```

Every deploy keeps the previous `production.compose.yml` as `production.compose.yml.previous`,
the previous `production.env` as `production.env.previous` (root, `0600`), the previous nginx site
under `/srv/explorers/nginx-backups/`, and the last five releases under `/srv/explorers/releases/`.

Rolling back a deploy re-runs the workflow, which renders `production.env` from the **current**
`explorers-production` environment. Nothing restores `production.env.previous` automatically:

- A `stage` refusal puts the compose file back but leaves the new `production.env`. That file is
  the validated configuration in GitHub, and the running containers keep the values they started
  with.
- To return to an older configuration, change the values in GitHub and deploy again.
- In an emergency only, `sudo cp -p /opt/explorers/production.env.previous
  /opt/explorers/production.env` restores the last file until the next deploy.

---

## 8. Afterwards: the old Strapi and Music hosts

Leave them running until section 6 has passed and a few days of traffic have gone by. Retiring
them is other work: **P6** (Strapi retirement) and **P3-7** (delete the legacy composition, its
deployment and `tunes-deploy.yml`), in the
[launch backbone](../superpowers/plans/2026-10-17-explorers-launch-backbone.md) and
[the P3 plan](../superpowers/plans/2026-10-18-p3-music-removal.md).

---

## 9. Measured timings (rehearsal, 2026-10-18)

The migration counts below are from that run, when `main`'s head was `0057`. Today's head is
`0060_explorers_guide_budget_tier`.

The stand-in was Ubuntu 24.04 with apt's Docker 29.1.3, Compose 2.40.3 and nginx 1.24.0, on a
Windows workstation, with a registry on the local Docker network. **Pulls will be slower on the
real host:** the API image is about 1.0 GB unpacked and `postgres:15-alpine` about 0.4 GB, and in
the rehearsal both came over a local network.

| Step | Time | Notes |
|---|---|---|
| Platform SPA build (`landing:check`, `tsc -b`, `vite build`, bundle check) | 45s | 39s of it is `tsc -b` |
| API image build (`docker build ./tunes`) | 60–65s | warm layer cache; CI starts colder |
| Bootstrap `init`, then `check` | 1s each | |
| Assemble the release, render the site, pack | 2–3s | |
| Pre-deploy backup phase on a fresh host | 1s | reports `fresh`; nothing to back up |
| **First `stage`** (pull, empty DB → 57 migrations, gate, API healthy) | **36s** | longest step; 17s when postgres is already pulled |
| Set the trusted proxy (`up -d --wait api`) | 8s | measured with the old host-side edit; step 5.3 is now a redeploy, like the row "Redeploy, same schema" |
| API acceptance checks | <1s | |
| `activate` (site swap, `nginx -t`, reload, HTTPS check) | 1s | |
| Taxonomy dry run + apply + re-apply | 4s | 335 terms |
| Probe + browser smoke | 7s | |
| Backup on the host (`platform-backup.mjs`, local mode) | 1s | 118 tables, 0.8–0.9 MB encrypted archive (empty accounts + taxonomy) |
| **Restore drill** (decrypt, fresh PostgreSQL, `pg_restore`, drift repair, schema and role attestation, boot the app, probe) | **6.1s** | decrypt 0.6s, start PostgreSQL 2.1s, `pg_restore` 0.9s, boot 1.7s; the database and container are removed afterwards |
| Pre-deploy backup before each later deploy | 1s | local mode in the rehearsal; real ones add the S3 upload |
| Redeploy, same schema (v1 → v2), whole deploy | 24s | `stage` 15s; **API 503s for at most 2.5s** (6 of 42 half-second polls) |
| Roll back the image, same schema (v2 → v1) | 21s | at most 2.5s of 503s; journal unchanged at 57 |
| Deploy a forward migration (v3, 0058) | 22s | journal 57 → 58 |
| Refused rollback past a migration (v3 → v1) | 5s | nothing changed |

Budget **20 minutes** of hands-on time for sections 5 and 6, plus however long the GitHub runs
take. The visible switch, from `activate` to the site serving, took about a second.

The restore number is for a nearly empty database and is dominated by fixed costs (starting
PostgreSQL, booting the app). A production restore adds the S3 download and a `pg_restore`
that grows with the data. Re-read `recoveryMilliseconds` from each monthly drill.

In the rehearsal, backups use `platform-backup.mjs --environment local` (same dump, archive,
encryption and manifest, written to a directory instead of S3), because the rehearsal never
contacts S3. The deploy's own backup phase ran for real on the first deploy, where it reports
`fresh`, including on a host whose postgres was running with an empty database.

---

## 10. What the rehearsal found in the plan

Each of these is fixed in the repository or written into the steps above.

1. **The first deploy could never succeed.** `explorers-deploy.sh stage` read the migration
   journal with one `CASE` statement that only reads the table when it exists. PostgreSQL resolves
   the table name before running anything, so an empty database failed with
   `relation "music_schema_migrations" does not exist`. Fixed: two queries.
2. **`activate` died silently on the first deploy.** `nginx -s reload` returns before the new
   workers listen, so the HTTPS check found nothing on :443 and `set -e` exited with code 7, no
   message, and no restore. Fixed: poll for up to 15s, and restore the previous site if the check
   still fails.
3. **A refused rollback left the wrong compose file.** `stage` installed the incoming compose
   file before the image-age check, so a refusal left the older marker beside the newer running
   image, and the next `compose up` failed the gate. Fixed: every refusal before the new image
   starts puts the previous file back.
4. **No manual compose command could run.** `production.env` holds only image placeholders, and
   the plan's taxonomy command passed no `--env-file` at all. Fixed: `stage` records the running
   image in `/opt/explorers/image.env`; step 5.4 shows the command that works.
5. **The taxonomy path was wrong.** It is `dist/apply-reviewed-taxonomy.js`, not
   `dist/scripts/...`.
6. **The trusted-proxy inspect command prints junk** (`172.20.0.1invalid IP`), and the example
   value `172.18.0.1` was wrong. The real value can only be known after the first `up`. Fixed:
   `stage` compares the two, warns on the first deploy and refuses later ones.
7. **The trusted-proxy proof was wrong.** The plan said two `X-Forwarded-For` values should get
   separate buckets. Through nginx they correctly share one, because a client's own XFF is not
   trusted and nginx appends the real address. Sent straight to the API, they must get separate
   buckets. Step 5.3 checks that.
8. **Picking the nginx site file was a guess.** `explorers-bootstrap.sh check` now names the file
   that serves the hostname, and warns when it is a symlink.
9. **Task 9 Steps 1, 1a and 4 do nothing for a start-fresh cutover.** There is no data to back up
   before the first deploy, there are no users to hold handles for, and the database principals
   create themselves.
10. **The workflow's acceptance checks were inline YAML**, so the rehearsal could not run the same
    code. They are now `deploy/host/api-acceptance.sh`, which both the workflow and the rehearsal
    run.
11. **#141's backup phase repeated finding 1.** It read the journal with the same single `CASE`
    statement, so re-running a first deploy whose stage had started postgres but not migrated
    would fail the backup and block the deploy. Fixed the same way, and rehearsed.
12. **Nothing told the owner to set `EXPLORERS_BACKUP_AGE_RECIPIENT`.** It was absent from
    `production.env.example` and unchecked, and every deploy after the first refuses without it.
    The example now has a deliberately invalid placeholder; `explorers-bootstrap.sh check`
    validates it and checks for Node 24.
13. **The committed drill receipt is at 0056 while `main` is at 0060.** See section 0, blocker 2.
