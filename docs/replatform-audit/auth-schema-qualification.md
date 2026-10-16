# Better Auth compatibility and schema qualification

**Result:** core schema generation/SQL application/adapter checks passed; MCP schema generation/SQL application/startup/discovery passed in an isolated disposable PostgreSQL 15 container. These are local qualification results, not live Google or ChatGPT acceptance and not application implementation.

## Pinned probe versions

Better Auth, auth CLI, Drizzle adapter, MCP and CIMD packages: **1.7.6**. Drizzle ORM **0.45.2**, Drizzle Kit **0.31.10**, pg **8.20.0**, TypeScript **5.6.3** match the repository's selected versions. Probe runtime Node **24.14.0**; auth CLI declares Node >=22.12.0, compatible with repository engine requirement. This run does not claim a separate Node22 runtime test. Exact dependency integrity is in [probe lockfile](auth-qualification/probe-package-lock.json).

## Executed checks

| Check | Observed result |
|---|---|
| Pinned CLI generates core Drizzle schema | 4 tables, 34 columns |
| Drizzle Kit emits PostgreSQL SQL | Passed |
| Core SQL applies to disposable PG15 | Passed |
| TypeScript5.6.3 compile with skipLibCheck, NodeNext | Passed for generated core and MCP schemas/configurations; dependency declaration internals not fully typechecked |
| Core adapter/constraint probe | 8 assertions passed: user creation, provider-account persistence, session create/read, session revocation, explicit provider uniqueness, orphan FK rejection, user cascades, catalog inventory |
| MCP/JWT/CIMD generation | 12 tables, 141 columns including the 34 core columns |
| MCP SQL applies to separate disposable database | Passed |
| MCP startup/discovery probe | 5 assertions passed: initialization, table inventory, resource registration, authorization-server metadata, protected-resource metadata |

See [core results](auth-qualification/core-results.json) and [MCP results](auth-qualification/mcp-results.json). No real Google credentials were used; provider-account persistence used synthetic data. No network call to Google or ChatGPT was part of the checks. The real application was not started.

## Exact generated schema authority

- [Core Drizzle definitions](auth-qualification/generated-core-schema.ts) and [core SQL](auth-qualification/generated-core.sql).
- [MCP composition Drizzle definitions](auth-qualification/generated-mcp-schema.ts) and [MCP SQL](auth-qualification/generated-mcp.sql).
- [Application provider-identity unique index](auth-qualification/provider-identity-index.sql), separately identified and tested.
- [Artifact hashes](auth-qualification/sha256.json).

The generator uses text IDs, timestamp **without time zone**, snake-case physical columns, unique user email/session token, and cascading user FKs for sessions/provider accounts. Some updated_at fields are filled by Drizzle's on-update function rather than a SQL DEFAULT; raw SQL must provide required values. It does not emit unique(provider_id,account_id); add the separately reviewed unique index to enforce our provider identity invariant and handle conflict by re-reading that identity. Ordinary application tables retain timestamptz. Set DB/session/process timezone UTC and test serialization; do not claim the generated auth columns are timestamptz.

The MCP schema includes jwks, oauth_client, oauth_resource, oauth_client_resource, oauth_refresh_token, oauth_access_token, oauth_consent and oauth_client_assertion in addition to the core four. The MCP plugin already composes OAuth; do not also add oauthProvider. [Official adapter guidance](https://better-auth.com/docs/adapters/drizzle), [MCP composition guidance](https://better-auth.com/docs/plugins/mcp).

## Generator and startup sequencing

The initial empty adapter reports missing schema before generating core definitions. For the MCP configuration, initializing the database-backed plugin before definitions exist fails on oauthResource. The supported CLI adapter/dialect override generated schema from a config without a database adapter; after applying its SQL, initialization with the generated schema passed. Make offline generation and migration prerequisites to database-backed plugin startup. These are observed setup failures with a verified correction, not hidden successful runs.

Probe commands used the pinned local auth CLI `generate`, then pinned drizzle-kit `generate`, then psql with ON_ERROR_STOP into the named disposable databases. No `auth migrate`, schema push or application migration file was used. Saved probe configs use only synthetic local values. Reproducing requires substituting the fresh disposable port and copying the probe manifest as package.json in an isolated directory; never point these scripts at QA/production.

## Remaining qualification boundaries

1. Real Google redirect/cookie/consent behavior requires the chosen hostname and OAuth client credentials/callback registration.
2. Recovery hook seams are source-qualified; the application recovery state/one-use proof and negative tests are not implemented. See [recovery qualification](auth-recovery-qualification.md). A fresh code callback does not prove newly entered Google password/MFA.
3. OAuth consent is not a universal token grant ID. The revised schema uses an application consent binding and generation; runnable issuance/refresh/revoke/reconnect tests must prove the token claim or opaque-token record carries its original binding generation. Native consent deletion alone is insufficient. This remains an Epic10 qualification, not a blocker to the Google-only web schema.
4. Whole-application constraints, migrations, query plans and load tests remain implementation acceptance. This probe does not establish full-platform scalability or production capacity.

No existing database or application dependency file was changed. Disposable databases are removed after evidence collection.
