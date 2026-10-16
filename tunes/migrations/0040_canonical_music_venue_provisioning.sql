-- 0040: a canonically provisioned Music venue passes the identity insert guard.
--
-- ADR-007 and migration 0039 let a canonically provisioned venue carry NULL in both
-- strapi_user_document_id and strapi_account_document_id. The BEFORE INSERT guard
-- enforce_music_identity_insert() still mirrors every new venue into
-- music_identity_lifecycle_operations, whose strapi_user_document_id and
-- strapi_account_document_id are NOT NULL with length checks, so a canonical insert
-- failed with 23502 inside the trigger before it could commit. accountMusicRepository
-- could therefore not provision a Music account against a real database at all; the
-- unit tests use a fake pool, so only a real-PostgreSQL case exposed it.
--
-- A canonical owner has no representable Strapi-keyed lifecycle operation, exactly as
-- ADR-008 decision 5 already records for tombstones, so provisioning does not write
-- one and leaves lifecycle_state at its 'none' default. Every guard that does not
-- depend on a Strapi identity still runs for both kinds of venue: the numeric user id
-- advisory lock and the numeric tombstone check, which is what protects a retired
-- numeric id from reuse. The Strapi-keyed pair lock, the Strapi-keyed tombstone check
-- and the operation mirror are all vacuous or impossible for NULL inputs, so they are
-- skipped together rather than individually weakened.
--
-- A venue carrying exactly one of the two Strapi columns is neither a legacy nor a
-- canonical identity. Nothing created such a row before, and either branch would treat
-- it wrongly, so it is refused explicitly instead of being allowed to pick a branch.
--
-- users.lifecycle_operation_id is a NOT NULL foreign key into that same operations
-- table, so a venue with no operation row cannot carry a value for it either: the
-- column is relaxed and a canonical venue carries NULL, which is what "this venue has
-- no Strapi-keyed lifecycle operation" means. The foreign key is MATCH SIMPLE, so NULL
-- satisfies it while any non-NULL value must still name a real operation - that
-- constraint, not a new trigger branch, is what keeps a canonical venue from inventing
-- an operation id. The legacy path is untouched and still supplies one.

ALTER TABLE public.users ALTER COLUMN lifecycle_operation_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION enforce_music_identity_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE operation music_identity_lifecycle_operations%ROWTYPE;
BEGIN
  PERFORM lock_music_numeric_user_id(NEW.id);
  IF EXISTS (SELECT 1 FROM music_identity_tombstones WHERE music_user_id=NEW.id) THEN
    RAISE EXCEPTION 'numeric Music user ID is retired';
  END IF;
  IF (NEW.strapi_user_document_id IS NULL) <> (NEW.strapi_account_document_id IS NULL) THEN
    RAISE EXCEPTION 'external identity must be complete or absent';
  END IF;
  IF NEW.strapi_user_document_id IS NULL THEN
    RETURN NEW;
  END IF;
  PERFORM lock_music_identity_pair(NEW.strapi_user_document_id, NEW.strapi_account_document_id);
  IF EXISTS (SELECT 1 FROM music_identity_tombstones
             WHERE strapi_user_document_id=NEW.strapi_user_document_id
                OR strapi_account_document_id=NEW.strapi_account_document_id) THEN
    RAISE EXCEPTION 'immutable external identity is tombstoned';
  END IF;
  INSERT INTO music_identity_lifecycle_operations(
    operation_id,strapi_user_document_id,strapi_account_document_id,music_user_id,operation_kind,
    requested_identity_status,operation_state,attempt_count,result_session_version
  ) VALUES (NEW.lifecycle_operation_id,NEW.strapi_user_document_id,NEW.strapi_account_document_id,NEW.id,
    'provision','active','completed',1,NEW.session_version) ON CONFLICT (operation_id) DO NOTHING;
  SELECT * INTO operation FROM music_identity_lifecycle_operations WHERE operation_id=NEW.lifecycle_operation_id;
  IF operation.strapi_user_document_id IS DISTINCT FROM NEW.strapi_user_document_id
     OR operation.strapi_account_document_id IS DISTINCT FROM NEW.strapi_account_document_id
     OR operation.music_user_id IS DISTINCT FROM NEW.id
     OR operation.operation_kind <> 'provision' OR operation.requested_identity_status <> 'active'
     OR operation.operation_state <> 'completed' THEN RAISE EXCEPTION 'lifecycle operation mismatch'; END IF;
  NEW.lifecycle_state := 'completed';
  NEW.lifecycle_attempt_count := GREATEST(NEW.lifecycle_attempt_count,operation.attempt_count);
  RETURN NEW;
END;
$$;
