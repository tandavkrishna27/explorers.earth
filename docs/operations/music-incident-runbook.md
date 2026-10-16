# Music identity incident runbook

## Scope and first response

Use this runbook for identity/ownership conflicts, credential compromise, unauthorized owner/guest behavior, lifecycle drift, reconciliation anomalies, migration/readiness failure, or public exposure. Production mutation remains separately authorized and requires independent protected-environment approval.

Preserve the request/run ID, exact commit and image digest, current/previous migration marker, sanitized readiness state, affected operation ID, and time window. Do not copy tokens, cookies, emails, identity payloads, guest URLs/capabilities, database strings, response headers, or raw upstream errors into tickets or chat.

## Contain

1. Set the server-side provisioning kill switch and disabled cohort through the authorized production control path. Do not ship a browser flag.
2. Keep the application serving existing locally valid credentials unless the incident requires revocation; do not call Strapi from ordinary owner routes.
3. For token compromise, increment the affected identity `sessionVersion`; for a signing-key incident, distribute new verification authority, switch minting, and retain only the overlap needed for unaffected live credentials.
4. For guest-capability exposure, run an owner-authorized idempotent publication rotation/revocation. Never paste or test the capability in a URL.
5. Suspend publication for an affected identity without deleting content. Unknown/private/suspended/pending/revoked public resources must retain the same safe 404.
6. Stop reconciliation apply. Scheduled production reconciliation is report-only and must remain so.

## Diagnose

Locate sanitized logs/metrics with the request/run ID and stable code. Verify the generated route/policy inventory, owner predicate, lifecycle/session version, entitlement freshness, publication mode, and exact migration marker. Compare aggregate reconciliation evidence only; never export identity rows as a shortcut.

For disposable fixture reproduction, run `npm run music:db:status -- --mode fixture --target test` and `npm run music:db:verify -- --mode fixture --target test`; those commands refuse every non-test target and never authorize production access. For a production database incident, use only the approved same-image migration/readiness and private operator evidence from the deployment runbook—never point the fixture CLI at production. Confirm the private target, backup timestamp, completed restore proof, expected catalog fingerprint, migration attestation, runtime/migrator role separation, and readiness. A missing/partial/future journal entry or catalog drift is a hard stop.

For upstream symptoms, confirm exact HTTPS origin, certificate/pinning policy, bounded pagination totals/checksum/snapshot, dedicated read-only token permissions, circuit state, and retry budget. One incomplete scan must never suspend identities.

## Recover

Prefer forward repair when the schema is healthy. Lifecycle workers may retry bounded idempotent phases; dead-letter recovery requires an operator-reviewed operation ID and must respect the irreversible deletion boundary. A tombstone is never deleted to recreate an identity.

Rollback only with the checked-in deployment executable and a digest already present in the authenticated secure manifest. The target must be at or above both the permanent containment floor and current schema floor and must retain every live Music-signing and publication-response key. Unknown, mutable-tag, pre-floor, or older-marker rollback is refused. Gate/readiness failure keeps the previous app routed and stops the private candidate.

After recovery, verify liveness, readiness, migration and schema floor, exact route target, owner/cross-owner matrices, credential revocation, guest isolation, publication privacy, lifecycle state, and report-only reconciliation. Run a canary only after separate authorization and monitor a full approved cycle before re-enabling provisioning.

## Escalation by stable code

- Authentication/token codes: identity/security owner.
- Identity conflict, Account switch, tombstone, pending deletion, suspension, or dead letter: identity plus lifecycle owner.
- Database/migration/readiness codes: database and deployment rollback owner.
- Upstream malformed/unavailable or reconciliation anomaly: Strapi contract/reconciliation owner.
- Guest/publication capability or socket isolation: security and publication owner.
- `INTERNAL_ERROR`: service owner with the sanitized request ID; never expose the raw exception.

Close the incident only after evidence sanitation passes, leaked authorities are rotated/revoked, repair is idempotently verified, the kill-switch decision is recorded, and follow-up tests reproduce the original failure before proving the fix.
