# Owner setup checklist

Planning/configuration checklist only. No secret values requested or recorded. The owner confirmed access to the existing Google Cloud project and approved private S3 with organized account/purpose keys and authorized application delivery.

## Google Cloud: owner action

1. In the existing Google Cloud project, identify the OAuth **Web application** client currently used by Strapi. Do not delete its existing redirects yet.
2. Use one Google Web OAuth client for local, QA and production, as agreed. Register each exact callback explicitly.
3. Once origins are pinned, register exact backend callbacks ending `/api/auth/callback/google`. Existing Strapi callback URLs do not substitute. Local port and QA hostname are still to be finalized; do not enter placeholders.
4. Verify consent-screen branding/support, audience, testing/publishing state and allowed test users as applicable. Request only sign-in identity scopes.
5. Put client ID and client secret into the matching GitHub environment, never into a frontend `VITE_` variable or chat. Alternatively grant appropriate existing project access so setup can be carried out through approved mechanisms.

## GitHub configuration contract

Repository Settings → Environments. Proposed target environment names: `explorers-qa` and `explorers-production`. These are new names, not environments verified to exist. Preserve current production approvals while consolidating deployment; no settings have been changed by this checklist.

| Name | Type | Owner/input |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Environment secret (identifier is not confidential, but colocate with provider configuration) | Owner copies from matching Google Web client |
| `GOOGLE_CLIENT_SECRET` | Environment secret | Owner copies securely from matching client |
| `BETTER_AUTH_SECRET` | Environment secret, different per environment | Agent generates securely during setup; owner need not invent it |
| `BETTER_AUTH_URL` | Environment variable | Explicit application origin once routing is pinned |
| `AWS_REGION` | Environment variable | Confirm existing region |
| `MEDIA_BUCKET` | Environment variable | Same agreed private bucket in both environments |
| `MEDIA_KEY_PREFIX` | Environment variable | Environment boundary, e.g. `qa/` or `prod/`, server-enforced; additional IAM restrictions only if verified |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Environment secrets only when not using a server IAM role | Reuse only after permission review; do not create broad new keys by default |

These are the proposed unified names the implementation must consume. Existing Strapi uses `AWS_ACCESS_SECRET` and `AWS_BUCKET`; do not assume automatic compatibility. Existing repository-level secrets need not be deleted now. Workflow implementation must inject secrets into backend runtime without baking them into images or browser assets. Adding GitHub secrets alone does not configure a running server or a local workstation.

## AWS: owner confirmation/access

- Identify the existing bucket and region and whether the owner can manage its IAM/bucket settings.
- Use one existing suitable private bucket with separate `qa/` and `prod/` prefixes. Reuse the existing AWS credentials after permission verification. If the same principal can access both prefixes, this is application-level separation, not IAM isolation: bind the prefix in server configuration and reject caller-supplied keys; document that residual shared-credential access. Do not claim prefix isolation is enforced by IAM unless tested.
- Use the server's IAM role if available. Otherwise provide narrowly scoped credentials through the environment secret mechanism. Scope object get/put/delete to the required prefix; include only necessary list/multipart permissions for implemented operations.
- Keep the new storage private and use supported bucket ownership settings; do not copy the old public-read ACL default. Do not change a currently used bucket policy blindly before the replacement is configured.
- The agent records bucket/IAM/key layout, ownership, upload limits, byte delivery and cleanup in implementation configuration and verifies actual QA upload/read/delete plus private-access denial.

## Domains and existing infrastructure

Owner must choose/confirm the public QA hostname and ensure DNS access is available. The existing Tunes machine is the QA host; this does not automatically establish its intended hostname. Production remains the current Explorers domain. Agent verifies existing host credentials, TLS/routing and capacity; only missing access is requested.

Local runs use disposable fixture storage/provider data by default. For real local Google testing, use the agreed shared client via an ignored local secret file or approved secret manager. Never commit that file. GitHub secret values cannot simply be downloaded by the agent; CI/deployment can reference them under their configured scope.

## Agent-owned tasks, not a credential shopping list for the owner

- Finalize local port and origins, then provide the exact Google redirect list.
- Prepare environment configuration and workflows; verify permission before changing repository/cloud settings.
- Generate application secrets securely; preserve deployment gates and configure required checks.
- Audit available provider credentials and request only missing inputs.
- Produce nonsecret evidence of Google and S3 checks; do not echo secrets into logs or screenshots.

**Immediate owner inputs:** preferred QA hostname; confirmation of AWS bucket/IAM administration access. Google client setup can proceed once exact callback origins are known. No application implementation is started by this checklist.

## Agreed deployment simplicity

Use the existing Tunes server for QA and the existing main server for production. Each runs the app and its own self-hosted PostgreSQL database; Amazon RDS is not required. Keep data, volumes and generated Better Auth secrets separate. Promote the exact tested build after QA acceptance and an explicit release decision; deployment to QA alone does not deploy production. The owner reports existing AWS credentials are suitable; this is an input, not completed permission verification.
