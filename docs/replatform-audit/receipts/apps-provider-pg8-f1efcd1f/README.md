# Apps provider and scheduler PG8 qualification

The guarded private runner (`.superpowers/sdd/2026-10-09-replatform-waves/
apps-local-provider-pg-qualification.mjs --run`) passed all 8 actual PostgreSQL
cases on clean `f1efcd1f80a63db388737fb8623ce312ae57c23a`, suite "Apps local
actual PostgreSQL providers", protocol `apps-local-provider-finite-v1`,
`runReason: passed`, `failureReasons: []`.

Zero non-passed cases. `sourceIntact: true`, cleanup passed (exact id absent,
exact ownership absent, exact owned anonymous volumes absent), and the runner
reports `appsLocalProviderQualified: true`.

Collected inventory was 8 cases (8 PG, 0 portable) against an expected 8, with
56 migrations. This gate makes real outbound requests and schedules against the
next native UTC minute; that does not establish a hosted nightly schedule.

Attested with `APP_ENRICHMENT_REVIEWED_SOURCE_SHA256` =
`d30df2181574f5e3500da385b92e072b339b235b4dd6977fccdb0ecdebab7538`, a separate
frozen manifest from the places gate.

`qualification-summary.json` is an explicitly derived, sanitized summary; the
original receipt is hashed into it and was not copied.
