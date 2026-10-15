# Places/pins PG128 qualification

The guarded private runner (`.superpowers/sdd/2026-10-09-replatform-waves/
places-p1-pg-qualification.mjs --run`) passed all 128 actual PostgreSQL cases on
clean `f1efcd1f80a63db388737fb8623ce312ae57c23a`, using the pinned
postgres:15-alpine image `sha256:f7d2335...` and Node 24.21.0.

Zero non-passed cases. `sourceIntact: true`. Cleanup passed with exact container
id absent, exact ownership absent and owned anonymous volumes absent. Collected
inventory was 128 cases against an expected 128, with 56 migrations.

The runner requires an operator-supplied reviewed-source attestation
(`PLACE_PINS_REVIEWED_SOURCE_SHA256`) equal to the frozen manifest hash. It was
supplied for manifest `24da12057c823f892691ef16a165f7a61feb2b9560154266810a90270d0b1a26`
after independent review of the only delta from the previously reviewed state:
9 lines across two public-parity files, with zero files in the places/pins
closure.

`p1Closure` is reported `false` by the runner, deliberately: dedicated PG
evidence alone is not overall P1 closure.

`qualification-summary.json` is an explicitly derived, sanitized summary; the
original receipt is hashed into it and was not copied.
