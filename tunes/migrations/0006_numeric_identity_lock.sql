-- Numeric Music user IDs are durable identity resources. Serialize every
-- INSERT and authorized delete on the numeric key after the external user and
-- Account keys, but before PostgreSQL can take a users row/unique-index lock.
CREATE FUNCTION lock_music_numeric_user_id(p_user_id integer) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_user_id IS NULL OR p_user_id <= 0 THEN
    RAISE EXCEPTION 'numeric Music user ID is required';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('music:numeric-user:' || p_user_id::text,0));
END;
$$;

CREATE OR REPLACE FUNCTION enforce_music_identity_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE operation music_identity_lifecycle_operations%ROWTYPE;
BEGIN
  PERFORM lock_music_identity_pair(NEW.strapi_user_document_id, NEW.strapi_account_document_id);
  PERFORM lock_music_numeric_user_id(NEW.id);
  IF EXISTS (SELECT 1 FROM music_identity_tombstones
             WHERE strapi_user_document_id=NEW.strapi_user_document_id
                OR strapi_account_document_id=NEW.strapi_account_document_id) THEN
    RAISE EXCEPTION 'immutable external identity is tombstoned';
  END IF;
  IF EXISTS (SELECT 1 FROM music_identity_tombstones WHERE music_user_id=NEW.id) THEN
    RAISE EXCEPTION 'numeric Music user ID is retired';
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

CREATE OR REPLACE FUNCTION finalize_music_identity_deletion(
  p_user_id integer,
  p_operation_id text,
  p_reason text
) RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE
  identity users%ROWTYPE;
  operation music_identity_lifecycle_operations%ROWTYPE;
  tombstone music_identity_tombstones%ROWTYPE;
  next_session_version integer;
BEGIN
  IF p_user_id IS NULL OR p_user_id <= 0 THEN RAISE EXCEPTION 'numeric Music user ID is required'; END IF;
  IF p_operation_id IS NULL OR length(p_operation_id)=0 THEN RAISE EXCEPTION 'lifecycle operation ID is required'; END IF;
  IF p_reason IS NULL OR length(p_reason)=0 THEN RAISE EXCEPTION 'delete reason is required'; END IF;

  SELECT * INTO identity FROM users WHERE id=p_user_id;
  IF NOT FOUND THEN
    SELECT * INTO tombstone FROM music_identity_tombstones WHERE lifecycle_operation_id=p_operation_id;
    SELECT * INTO operation FROM music_identity_lifecycle_operations WHERE operation_id=p_operation_id;
    IF FOUND AND tombstone.lifecycle_operation_id=p_operation_id
       AND tombstone.music_user_id=p_user_id AND operation.music_user_id=p_user_id
       AND operation.operation_kind='delete' AND operation.operation_phase='finalized'
       AND operation.operation_state='completed' THEN
      RETURN false;
    END IF;
    RAISE EXCEPTION 'resource-bound deletion history not found';
  END IF;

  PERFORM lock_music_identity_pair(identity.strapi_user_document_id, identity.strapi_account_document_id);
  PERFORM lock_music_numeric_user_id(p_user_id);
  SELECT * INTO identity FROM users WHERE id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    SELECT * INTO tombstone FROM music_identity_tombstones WHERE lifecycle_operation_id=p_operation_id;
    SELECT * INTO operation FROM music_identity_lifecycle_operations WHERE operation_id=p_operation_id;
    IF FOUND AND tombstone.lifecycle_operation_id=p_operation_id
       AND tombstone.music_user_id=p_user_id AND operation.music_user_id=p_user_id
       AND operation.operation_kind='delete' AND operation.operation_phase='finalized'
       AND operation.operation_state='completed' THEN
      RETURN false;
    END IF;
    RAISE EXCEPTION 'resource-bound deletion history not found';
  END IF;

  SELECT * INTO operation FROM music_identity_lifecycle_operations WHERE operation_id=p_operation_id FOR UPDATE;
  IF NOT FOUND THEN
    next_session_version := identity.session_version + 1;
    INSERT INTO music_identity_lifecycle_operations(
      operation_id,strapi_user_document_id,strapi_account_document_id,music_user_id,operation_kind,
      requested_identity_status,operation_state,attempt_count,result_session_version,operation_phase
    ) VALUES (
      p_operation_id,identity.strapi_user_document_id,identity.strapi_account_document_id,identity.id,'delete',
      'pending_deletion','completed',1,next_session_version,'prepared'
    ) RETURNING * INTO operation;
  ELSE
    IF operation.strapi_user_document_id IS DISTINCT FROM identity.strapi_user_document_id
       OR operation.strapi_account_document_id IS DISTINCT FROM identity.strapi_account_document_id
       OR operation.music_user_id IS DISTINCT FROM identity.id
       OR operation.operation_kind <> 'delete' OR operation.requested_identity_status <> 'pending_deletion'
       OR operation.operation_state <> 'completed' OR operation.operation_phase NOT IN ('prepared','finalized') THEN
      RAISE EXCEPTION 'lifecycle operation mismatch';
    END IF;
    next_session_version := operation.result_session_version;
  END IF;

  IF operation.operation_phase='finalized' THEN
    SELECT * INTO tombstone FROM music_identity_tombstones WHERE lifecycle_operation_id=p_operation_id;
    IF FOUND AND tombstone.music_user_id=p_user_id THEN RETURN false; END IF;
    RAISE EXCEPTION 'finalized lifecycle operation lacks resource-bound tombstone';
  END IF;

  IF identity.identity_status <> 'pending_deletion' THEN
    UPDATE users SET
      identity_status='pending_deletion', session_version=next_session_version,
      lifecycle_operation_id=p_operation_id, lifecycle_state='completed',
      lifecycle_attempt_count=lifecycle_attempt_count+1, lifecycle_last_attempt_at=now(),
      lifecycle_error_code=NULL
    WHERE id=p_user_id
    RETURNING * INTO identity;
  ELSIF identity.lifecycle_operation_id IS DISTINCT FROM p_operation_id
        OR identity.session_version IS DISTINCT FROM operation.result_session_version THEN
    RAISE EXCEPTION 'lifecycle operation mismatch';
  END IF;

  PERFORM set_config('music.lifecycle_delete_authorized','true',true);
  PERFORM set_config('music.lifecycle_operation_id',p_operation_id,true);
  PERFORM set_config('music.lifecycle_user_id',p_user_id::text,true);
  PERFORM set_config('music.lifecycle_delete_reason',p_reason,true);
  DELETE FROM users WHERE id=p_user_id;
  UPDATE music_identity_lifecycle_operations
  SET operation_phase='finalized' WHERE operation_id=p_operation_id;
  RETURN true;
END;
$$;
