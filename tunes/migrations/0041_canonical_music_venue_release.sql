-- 0041: a canonically provisioned Music venue can be released when its account is deleted.
--
-- Account deletion cannot finalise for any account that owns a Music venue.
-- accountLifecycleMaintenance marks a pending delete MUSIC_BOUNDARY_PENDING and excludes
-- it from the claim window whenever account_music_identity has a row, and its comment
-- says why: "Music ownership is delivered in 6.1". Before 6.1 nothing in production ever
-- created that row, so the boundary was unreachable. 6.1 delivered provisioning without
-- the release, which turned a deferred gap into a deletion request that never completes.
--
-- Releasing a canonical venue means deleting its users row: every one of the nineteen
-- foreign keys into users(id) is ON DELETE CASCADE or ON DELETE SET NULL, so the Music
-- content and the account_music_identity mapping go with it, and 0039's deferred
-- ownership trigger already tolerates the mapping disappearing while the venue row is
-- going away in the same transaction. One guard refuses: the AFTER DELETE trigger
-- retain_music_identity_tombstone_on_delete() records a tombstone keyed on
-- strapi_user_document_id, which is that table's primary key, and
-- strapi_account_document_id, which is NOT NULL UNIQUE. Both are NULL on a canonical
-- venue, so the delete fails on a not-null violation inside the trigger.
--
-- The tombstone exists to stop a retired *external* identity being re-created, which
-- ADR-008 decision 5 already records a canonical owner as not having: there is no Strapi
-- document id to retire, so there is nothing for a Strapi-keyed tombstone to protect.
-- This guard is therefore skipped for a canonical venue exactly as 0040 skips the
-- Strapi-keyed lifecycle-operation mirror on insert, and for the same reason. The
-- alternative - giving canonical owners a representable tombstone - requires widening
-- both music_identity_tombstones and music_identity_lifecycle_operations, which is the
-- ripple ADR-008 decision 3 deliberately avoided.
--
-- A legacy venue is untouched: it still records its tombstone, and
-- accountLifecycleMaintenance still refuses to finalise an account that owns one,
-- because retiring a Strapi identity is the deletion saga's own work.
--
-- Numeric Music user ids are not reused after this: they come from a sequence that never
-- goes backwards, and 0040's insert guard still checks the numeric tombstone column for
-- any id that does carry one.

--
-- The body below is 0005's, not 0003's, with only the canonical early return added.
-- 0005 replaced this function to record music_user_id, which is what the numeric
-- recreation guards read, to default the reason to 'database-delete', and to stop
-- synthesising a lifecycle operation id so that a delete without
-- music.lifecycle_operation_id fails its NOT NULL instead of inventing one. Replacing a
-- function in an append-only chain from the wrong ancestor silently reverts every later
-- hardening, so the latest definition is the one to extend.

CREATE OR REPLACE FUNCTION retain_music_identity_tombstone_on_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  requested_operation_id text;
  requested_reason text;
BEGIN
  IF OLD.strapi_user_document_id IS NULL AND OLD.strapi_account_document_id IS NULL THEN
    RETURN OLD;
  END IF;
  requested_operation_id := nullif(current_setting('music.lifecycle_operation_id',true),'');
  requested_reason := nullif(current_setting('music.lifecycle_delete_reason',true),'');
  INSERT INTO music_identity_tombstones(
    strapi_user_document_id,strapi_account_document_id,music_user_id,reason,lifecycle_operation_id
  ) VALUES (
    OLD.strapi_user_document_id,OLD.strapi_account_document_id,OLD.id,
    coalesce(requested_reason,'database-delete'),requested_operation_id
  );
  RETURN OLD;
END;
$$;
