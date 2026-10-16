-- 0042: a sanctioned function releases a canonical Music venue.
--
-- Ticket 6.4. accountLifecycleMaintenance cannot finalise an account deletion while
-- account_music_identity holds a row for that account, and 6.1 made that boundary
-- reachable by provisioning a mapping for every Explorer who opens Music. Releasing the
-- venue is what clears it.
--
-- 0004's reject_unauthorized_music_identity_delete guard permits a delete only when
-- three transaction-local settings name that exact venue, and finalize_music_identity_
-- deletion is the function that sets them for a legacy identity. Application code could
-- set them directly, but that would move the privilege out of the database's sanctioned
-- surface and leave ordinary maintenance code asserting the very control the guard
-- exists to enforce. This function keeps it inside, and does strictly more than assert:
-- it refuses unless the venue is genuinely canonical and genuinely owned by a pending
-- account deletion naming it, so a caller cannot use it to delete an arbitrary row.
--
-- It is deliberately not finalize_music_identity_deletion. That function retires a
-- *Strapi* identity: it records a Strapi-keyed tombstone and inserts an operations row
-- whose strapi_user_document_id and strapi_account_document_id are NOT NULL, neither of
-- which a canonical venue can satisfy. Under ADR-007 a canonical venue is a profile
-- owned by the account rather than an identity of its own, and ADR-008 decision 5
-- records that such an owner has no representable Strapi tombstone, so the account's own
-- deletion operation is the record of the retirement. Migration 0041 already skips the
-- Strapi-keyed tombstone on delete for the same reason.
--
-- The cascades do the rest: every foreign key into users(id) is ON DELETE CASCADE or
-- ON DELETE SET NULL, 0039's owner-retained trigger is silent while the venue row is
-- going away in the same transaction, and its ownership trigger fires on INSERT or
-- UPDATE rather than DELETE.
--
-- The authorization settings are cleared before returning, so they cannot authorize a
-- second, unchecked delete later in the same transaction.

CREATE OR REPLACE FUNCTION finalize_canonical_music_venue_deletion(
  p_music_user_id integer,
  p_operation_id text,
  p_reason text
) RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE identity users%ROWTYPE;
BEGIN
  IF p_music_user_id IS NULL OR p_music_user_id <= 0 THEN RAISE EXCEPTION 'numeric Music user ID is required'; END IF;
  IF p_operation_id IS NULL OR length(p_operation_id)=0 THEN RAISE EXCEPTION 'lifecycle operation ID is required'; END IF;
  IF p_reason IS NULL OR length(p_reason)=0 THEN RAISE EXCEPTION 'release reason is required'; END IF;

  SELECT * INTO identity FROM users WHERE id=p_music_user_id FOR UPDATE;
  -- Already released. Idempotent so a retried maintenance pass is not an error.
  IF NOT FOUND THEN RETURN false; END IF;

  IF identity.strapi_user_document_id IS NOT NULL OR identity.strapi_account_document_id IS NOT NULL THEN
    RAISE EXCEPTION 'legacy Music identity requires finalize_music_identity_deletion';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM account_music_identity mi
      JOIN account_lifecycle_operations o ON o.account_id=mi.account_id
      JOIN creator_accounts a ON a.id=o.account_id
     WHERE mi.music_user_id=p_music_user_id
       AND o.id::text=p_operation_id
       AND o.kind='delete'
       AND a.status='pending_deletion'
  ) THEN
    RAISE EXCEPTION 'canonical Music release requires a pending account deletion owning this venue';
  END IF;

  PERFORM set_config('music.lifecycle_delete_authorized','true',true);
  PERFORM set_config('music.lifecycle_operation_id',p_operation_id,true);
  PERFORM set_config('music.lifecycle_user_id',p_music_user_id::text,true);
  PERFORM set_config('music.lifecycle_delete_reason',p_reason,true);

  DELETE FROM users WHERE id=p_music_user_id;

  PERFORM set_config('music.lifecycle_delete_authorized','false',true);
  PERFORM set_config('music.lifecycle_user_id','',true);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION finalize_canonical_music_venue_deletion(integer,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finalize_canonical_music_venue_deletion(integer,text,text) TO music_runtime;
