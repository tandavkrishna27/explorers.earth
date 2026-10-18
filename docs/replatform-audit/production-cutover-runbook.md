# Production cutover runbook

**Status:** prepared 2026-10-17, against `main` at `8469a063bda6c5e4f31ada40b6a0615304bb604d`
(the PR #119 merge). Every claim below was verified by reading code, workflow files, and the
live GitHub API — not from prior documentation. Nothing in this runbook has been executed.

---

## 1. What deploying `main` today actually does

This is the most important section. The cutover is **not** "turn on the replatform".

| Effect | Detail |
|---|---|
| Ships 856 merged commits | The unified backend lands on the host as code. |
| **Production still runs Strapi** | `docker-compose.yml:9` pins `EXPLORERS_API_MODE: legacy-music`. The canonical assembly (`canonicalApp.ts`, `PostgresPublicProfileGateway`) stays dormant. |
| **Runs 35 database migrations** | The marker moved `0021_explorers_analytics_receipts` → `0056_explorers_app_enrichment_jobs`. 35 files (`0022`–`0056`) apply to production Postgres. |
| **Fails at compose render unless 4 vars are provisioned** | See section 2. This is a *new* hard requirement introduced by the merge. |

`EXPLORERS_API_MODE: canonical` appears only in `deploy/platform.compose.yml` (a separate,
offline two-image `explorers-api` + `explorers-web` topology that no workflow builds) and in the
replatform fixture compose. Switching production to the canonical backend is a **later, separate
decision** and is not part of this deploy.

## 2. Blocking prerequisite: four host environment variables

`docker-compose.yml:92-95` was changed by the merge to:

```yaml
EXPLORERS_MEDIA_ENVIRONMENT: ${EXPLORERS_MEDIA_ENVIRONMENT:?EXPLORERS_MEDIA_ENVIRONMENT is required}
EXPLORERS_DEPLOYMENT_TIER: ${EXPLORERS_DEPLOYMENT_TIER:?EXPLORERS_DEPLOYMENT_TIER is required}
EXPLORERS_MEDIA_S3_BUCKET: ${EXPLORERS_MEDIA_S3_BUCKET:?EXPLORERS_MEDIA_S3_BUCKET is required}
EXPLORERS_MEDIA_S3_REGION: ${EXPLORERS_MEDIA_S3_REGION:?EXPLORERS_MEDIA_S3_REGION is required}
```

The `:?` form makes `docker compose` **abort** if the variable is unset. These live in the
deploy host's env file, not in GitHub secrets — `tunes-deploy.yml` sends a signed
`music-deploy-request-v2` and the host-side agent renders the compose file locally.

Required values for production, as enforced by `resolveObjectStorage`
(`tunes/server/services/objectStorage.ts:180-190`):

| Variable | Production value | Enforcement |
|---|---|---|
| `EXPLORERS_DEPLOYMENT_TIER` | `production` | Must agree with the media environment, or startup throws `Media prefix does not match the deployment tier`. |
| `EXPLORERS_MEDIA_ENVIRONMENT` | `prod` | Must be exactly `qa` or `prod`; `local` is rejected when `NODE_ENV=production`. |
| `EXPLORERS_MEDIA_S3_BUCKET` | the private bucket name | Must be non-empty. |
| `EXPLORERS_MEDIA_S3_REGION` | e.g. `ap-south-1` | Must match `/^[a-z]{2}-[a-z-]+-\d$/`. |

**Non-obvious constraint:** `validateEnvironmentPair`
(`tunes/server/deployment/platform-release-contract.ts:62`) fails with
`SHARED_SERVICE_POLICY_INVALID` if QA and production use a *different* bucket or region. The two
tiers are expected to share one bucket and be isolated by key prefix (`qa/` vs `prod/`), not by
separate buckets. Provision one bucket accordingly.

The bucket must be private. Public-read would bypass the visibility gate in
`mediaRepository.ts` entirely.

## 3. Release gate status (verified live)

`tunes.yml` `release-preflight` requires two **push-event** runs on `main` at the exact release
SHA, each with a specific aggregate job concluding `success`. Both already exist for `8469a063`:

| Input | Run ID | Workflow | Required job | Verified |
|---|---|---|---|---|
| `validated_run_id` | `38932754560` | `ci.yml` | `replatform-required` | `success` |
| `music_validated_run_id` | `38932754401` | `test.yml` | `music-required` | `success` |

These are the exact values to supply to the dispatch. They are only valid while `main` points at
`8469a063`; any new commit on `main` invalidates both and new runs must be produced.

### One failure to clear first

The `tunes.yml` push run for this SHA (`38932754594`) **failed** in `build-test-scan-push`:

```
ERROR: failed to build: ... public.ecr.aws/docker/library/node:24.21.0-alpine@sha256:ebfe2f90...
429 Too Many Requests
##[error]buildx failed with: toomanyrequests: Data limit exceeded
```

This is a transient public-registry rate limit, not a code defect. The follow-on step
"Validate complete vulnerability report" failed only because the scan was skipped
(`COMPLETE_SCAN_OUTCOME: skipped`). `publish-image` depends on `build-test-scan-push`, so this
must be green before a release dispatch. **Re-run the job** and confirm it passes.

## 4. Approval path (verified live)

`tunes-deploy.yml` gates the deploy behind the protected `tunes-production` environment, and
`tunes/deployment/verify-production-environment-policy.mjs` independently re-verifies the policy
at run time. All of its conditions currently hold:

- `deployment_branch_policy`: `protected_branches: true`, `custom_branch_policies: false` — OK
- exactly one protected branch in the repo, `main`, protected — OK
- `required_reviewers` rule present with `prevent_self_review: true` — OK
- 1 reviewer, valid: user `tandavkrishna` (id 84907817), a collaborator with push — OK

**Practical consequence:** `prevent_self_review` means the account that dispatches cannot approve.
The repo owner is `tandavkrishna27`; the sole reviewer is the separate account `tandavkrishna`.
So the dispatch must come from `tandavkrishna27` and the approval from `tandavkrishna`. **You need
sign-in access to both accounts**, or the run will stall indefinitely awaiting an approval nobody
can grant. If access to `tandavkrishna` is not available, add a second reviewer *before*
dispatching.

Secrets `TUNES_DEPLOY_HOST` (set 2026-03-18) and `TUNES_DEPLOY_KEY` (set 2026-03-18) both exist.

## 5. Not in the deploy path

`scripts/platform-release.ts` → `verifyRelease()` always fails with
`TRUSTED_AUTHORITY_UNAVAILABLE` by design ("This offline package intentionally has no production
trust adapter"). This is **not** a cutover blocker: that script is reachable only through the
`platform:release` npm script, is referenced by no workflow, and targets the separate
`explorers-api`/`explorers-web` image pair that nothing builds. The live path is
`tunes.yml` → `tunes-deploy.yml` → `explorers-tunes` image.

## 6. Sequence

Owner actions are marked **[owner]**. Nothing here has been done.

1. **[owner]** Confirm sign-in access to both `tandavkrishna27` and `tandavkrishna`
   (section 4). If not, add a second environment reviewer first.
2. **[owner]** Provision the four variables in the deploy host's env file (section 2).
   Confirm the S3 bucket exists, is private, and matches the QA bucket/region.
3. **[owner]** Review the 35 pending migrations (`0022`–`0056`) and take a database backup.
   This is the only irreversible step in the deploy.
4. Re-run `build-test-scan-push` in run `38932754594` and confirm green (section 3).
5. **[owner]** Dispatch `tunes.yml` on `main` with:
   - `publish_image: true`
   - `deploy_music: true` (deploys the image published in the same run; `publish_image`
     alone only builds, attests and pushes the digest, and never reaches `tunes-deploy.yml`)
   - `validated_run_id: 38932754560`
   - `music_validated_run_id: 38932754401`
6. **[owner, as `tandavkrishna`]** Approve the `tunes-production` environment request.
7. Verify after deploy: production still answers on the legacy Strapi path
   (`EXPLORERS_API_MODE=legacy-music`), the migration marker reports `0056`, and media
   upload/serve still works for books, movies, games, apps, places.

## 7. Open items not resolved by this deploy

- **Canonical backend switch.** Requires `EXPLORERS_API_MODE: canonical` in the production
  compose, which no current compose file provides for the live topology. Separate decision.
- **Frontend deploy path.** `explorers.yml` is `if: ${{ false }}`; Netlify is not connected
  (all checks on this repo are `github-actions`, and commit statuses are empty). So no
  frontend deploy fires from this release. Decide the frontend path separately.
- **Products/People recommendation media.** Owner uploads are accepted and shown to the owner
  but no public projection emits them. See the companion finding; the visibility gate is
  *aligned* with the read model, so widening it alone would expose unreferenced assets.
