# Sanitized Strapi identity fixture

`identity.fixture.json` is deterministic C0 contract evidence derived from the
repository's actual response fields. A person and Account use immutable Strapi
v5 `documentId`; Account completion requires `Account_Name`, `Account_Type`,
and `mobile_number`; multiple completed Accounts are refused because the
repository has no persisted selection field. User lifecycle/entitlement fields
are `blocked` and `is_subscribed`; Account Music enrollment is the exact
`localtunes_integrated` value `Yes` or `No`.

The fixture contains no production PII or secret. Refresh it only through
`music:fixtures:capture`, increment `fixtureVersion` for a reviewed semantic
change, run the contract suite, and obtain TK identity-owner review. Live
capture remains fail-closed without explicit read-only credentials and endpoint
allowlisting; schema, pagination, lifecycle, or permission drift is blocking.
