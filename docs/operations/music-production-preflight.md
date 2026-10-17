# Music production preflight — BLOCKING ABORT

Before any release, rotate every previously exposed or default PostgreSQL,
session, cookie, Strapi service-token, and Strapi JWT credential. Record the
rotation evidence without secret values, verify old credentials are rejected,
and keep PostgreSQL private with no published host port. This implementation
does not perform production rotation or any other production mutation.

Status: **BLOCKED pending the protected read-only host preflight.** The manually
dispatched `.github/workflows/tunes-host-preflight.yml` workflow reuses the
proven `TUNES_DEPLOY_HOST` and `TUNES_DEPLOY_KEY` connection inside the
`tunes-production` environment. Its checked contract permits only sanitized
identity, SSH fingerprint, Docker/Compose version, storage, directory-mode,
container, network, volume, and Compose-label observations. It cannot restart
Docker, write files, change traffic, or execute SQL. The connection itself is
authenticated against the independently captured environment-scoped
`TUNES_DEPLOY_SSH_FINGERPRINT`; printing the server fingerprint after connection
is evidence, not the trust decision. Until that workflow runs,
no topology, row-count, container/volume, access-log, backup timestamp, or
restore result is claimed.
No direct/session-affine PostgreSQL and dedicated `LISTEN` capacity proof was
available either; transaction pooling or a stateless HTTP database transport
cannot satisfy the reconciliation advisory-lock/listener contract.

The repository's root Compose file describes a production-shaped PostgreSQL 15
service (`db`) with volume `postgres-data`, a Tunes service whose
`DATABASE_URL` resolves to `db`, and Traefik-facing services. That static file
does not prove the current database host/name/schema, running container or
volume IDs, historical database/URLs, live access logs, migration history,
table counts, or that a backup restores. There are no Drizzle migration files;
the current workflow uses schema push. Therefore clean-cutover design is
aborted until all missing evidence is captured and signed.

## Separately authorized read-only procedure

TK must provide a time-bounded read-only role and authorize the exact target.
Record only sanitized evidence: exact host/name/schema, app `DATABASE_URL`
target (redacted user/password), container/volume IDs, every manifest-table row
count, migration history, historical URLs/volumes, access-log evidence, backup
timestamp, and an independently observed restore proof. Abort immediately if
topology is ambiguous, dependent rows exist unexpectedly, an historical DB may
be live, restore fails, or required Strapi pagination/lifecycle contracts are
unavailable. An empty DB inspection alone is insufficient.

## Required Strapi proof

Capture sanitized schemas using immutable Strapi v5 `documentId` for the
current user and Account. Repository evidence defines a completed Account as
truthy `Account_Name`, `Account_Type`, and `mobile_number`; it exposes no
persisted selection field, so multiple completed Accounts are ambiguous and
must be refused. Entitlement/lifecycle evidence includes user `blocked` and
`is_subscribed` booleans plus Account `localtunes_integrated` as exact `Yes` or
`No`, complete semantic pagination, block/reactivate/delete behavior, and
service-token permissions. The local fixture proves these verified shapes but
does not substitute for the blocked live lifecycle/pagination proof.
