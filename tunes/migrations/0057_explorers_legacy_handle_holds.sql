-- Launch plan Workstream A2: hold every pre-relaunch handle for its original owner.
-- Printed QR codes encode /<handle>; the relaunch starts on an empty database, so without a
-- hold a stranger could claim an old handle and inherit every code its owner printed.
-- A held handle is claimable only by a signed-in Google user whose VERIFIED email digest
-- equals email_sha256 (tunes/server/application/legacyHandleHolds.ts). Only the digest is
-- stored, never the address. Rows are loaded once by the migrator through
-- dist/server/deployment/run-legacy-handle-holds.js; the runtime role can only read them.
CREATE TABLE public.legacy_handle_holds (
 -- The same normalisation as creator_accounts.handle_key, and the same shape its CHECK allows.
 handle_key text PRIMARY KEY
   CHECK(handle_key ~ '^[a-z][a-z0-9-]{2,29}$' AND handle_key !~ '--' AND right(handle_key,1) <> '-'),
 -- sha256 of the trimmed, lower-cased email, as lower-case hex.
 email_sha256 text NOT NULL CHECK(email_sha256 ~ '^[0-9a-f]{64}$'),
 held_until timestamptz NOT NULL
);

REVOKE ALL ON public.legacy_handle_holds FROM PUBLIC,music_runtime;
GRANT SELECT ON public.legacy_handle_holds TO music_runtime;
