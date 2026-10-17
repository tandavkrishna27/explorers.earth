ALTER TABLE music_identity_lifecycle_operations
  DROP CONSTRAINT music_identity_lifecycle_operations_operation_kind_check,
  ADD COLUMN operation_phase text NOT NULL DEFAULT 'single',
  ADD CONSTRAINT music_identity_lifecycle_operations_operation_phase_check
    CHECK (operation_phase IN ('single','prepared','finalized'));

DROP TRIGGER music_lifecycle_operation_state ON music_identity_lifecycle_operations;

UPDATE music_identity_lifecycle_operations
SET operation_kind='delete', operation_phase='prepared'
WHERE operation_kind='request_deletion';

ALTER TABLE music_identity_lifecycle_operations
  ADD CONSTRAINT music_identity_lifecycle_operations_operation_kind_check
    CHECK (operation_kind IN ('provision','suspend','reactivate','delete','cancel_deletion','tombstone'));

CREATE OR REPLACE FUNCTION enforce_music_lifecycle_operation_state() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.strapi_user_document_id IS DISTINCT FROM OLD.strapi_user_document_id
     OR NEW.strapi_account_document_id IS DISTINCT FROM OLD.strapi_account_document_id
     OR NEW.operation_kind IS DISTINCT FROM OLD.operation_kind
     OR NEW.requested_identity_status IS DISTINCT FROM OLD.requested_identity_status THEN
    RAISE EXCEPTION 'lifecycle operation identity is immutable';
  END IF;
  IF NEW.operation_phase IS DISTINCT FROM OLD.operation_phase AND NOT (
    OLD.operation_kind='delete' AND OLD.operation_state='completed'
    AND OLD.operation_phase='prepared' AND NEW.operation_phase='finalized'
  ) THEN
    RAISE EXCEPTION 'invalid lifecycle operation phase transition: % -> %', OLD.operation_phase, NEW.operation_phase;
  END IF;
  IF NEW.attempt_count < OLD.attempt_count THEN RAISE EXCEPTION 'lifecycle attempt_count cannot decrease'; END IF;
  IF NEW.operation_state IS DISTINCT FROM OLD.operation_state AND NOT (
    (OLD.operation_state = 'requested' AND NEW.operation_state IN ('running','failed','cancelled')) OR
    (OLD.operation_state = 'running' AND NEW.operation_state IN ('completed','failed','cancelled')) OR
    (OLD.operation_state = 'failed' AND NEW.operation_state = 'requested')
  ) THEN RAISE EXCEPTION 'invalid lifecycle operation transition: % -> %', OLD.operation_state, NEW.operation_state; END IF;
  IF (OLD.operation_state = 'requested' AND NEW.operation_state = 'running'
      OR OLD.operation_state = 'failed' AND NEW.operation_state = 'requested')
     AND NEW.attempt_count <> OLD.attempt_count + 1 THEN
    RAISE EXCEPTION 'lifecycle attempt_count must increment for an attempt';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER music_lifecycle_operation_state
BEFORE UPDATE ON music_identity_lifecycle_operations
FOR EACH ROW EXECUTE FUNCTION enforce_music_lifecycle_operation_state();

CREATE OR REPLACE FUNCTION enforce_music_identity_immutability() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE operation music_identity_lifecycle_operations%ROWTYPE;
BEGIN
  IF NEW.strapi_user_document_id IS DISTINCT FROM OLD.strapi_user_document_id THEN RAISE EXCEPTION 'immutable strapi_user_document_id'; END IF;
  IF NEW.strapi_account_document_id IS DISTINCT FROM OLD.strapi_account_document_id THEN RAISE EXCEPTION 'immutable strapi_account_document_id'; END IF;
  IF NEW.session_version < OLD.session_version THEN RAISE EXCEPTION 'session_version cannot decrease'; END IF;
  IF NEW.identity_status IS DISTINCT FROM OLD.identity_status THEN
    IF NEW.lifecycle_operation_id IS NOT DISTINCT FROM OLD.lifecycle_operation_id THEN RAISE EXCEPTION 'distinct lifecycle operation required'; END IF;
    SELECT * INTO operation FROM music_identity_lifecycle_operations WHERE operation_id=NEW.lifecycle_operation_id;
    IF NOT FOUND OR operation.strapi_user_document_id IS DISTINCT FROM NEW.strapi_user_document_id
       OR operation.strapi_account_document_id IS DISTINCT FROM NEW.strapi_account_document_id
       OR operation.requested_identity_status IS DISTINCT FROM NEW.identity_status
       OR operation.operation_state <> 'completed' OR NEW.lifecycle_state <> 'completed' THEN
      RAISE EXCEPTION 'lifecycle operation mismatch';
    END IF;
    IF NOT (
      (OLD.identity_status='active' AND NEW.identity_status='suspended' AND operation.operation_kind='suspend') OR
      (OLD.identity_status='suspended' AND NEW.identity_status='active' AND operation.operation_kind='reactivate') OR
      (OLD.identity_status IN ('active','suspended') AND NEW.identity_status='pending_deletion'
        AND operation.operation_kind='delete' AND operation.operation_phase='prepared') OR
      (OLD.identity_status='pending_deletion' AND NEW.identity_status='suspended' AND operation.operation_kind='cancel_deletion')
    ) THEN RAISE EXCEPTION 'invalid identity lifecycle transition: % -> %', OLD.identity_status, NEW.identity_status; END IF;
    IF (NEW.identity_status='suspended' AND OLD.identity_status='active' OR NEW.identity_status='pending_deletion')
       AND NEW.session_version <= OLD.session_version THEN RAISE EXCEPTION 'session_version must increment for suspension or deletion'; END IF;
  ELSIF NEW.lifecycle_operation_id IS DISTINCT FROM OLD.lifecycle_operation_id THEN
    RAISE EXCEPTION 'lifecycle operation cannot change without identity status';
  END IF;
  IF NEW.guest_capability_hash IS DISTINCT FROM OLD.guest_capability_hash
     AND NEW.guest_capability_rotated_at IS NULL THEN RAISE EXCEPTION 'guest capability rotation metadata required'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_music_tombstone_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE operation music_identity_lifecycle_operations%ROWTYPE;
BEGIN
  PERFORM lock_music_identity_pair(NEW.strapi_user_document_id, NEW.strapi_account_document_id);
  IF EXISTS (SELECT 1 FROM users
             WHERE strapi_user_document_id=NEW.strapi_user_document_id
                OR strapi_account_document_id=NEW.strapi_account_document_id) THEN
    RAISE EXCEPTION 'live immutable external identity exists';
  END IF;
  INSERT INTO music_identity_lifecycle_operations(
    operation_id,strapi_user_document_id,strapi_account_document_id,operation_kind,
    requested_identity_status,operation_state,attempt_count,operation_phase
  ) VALUES (NEW.lifecycle_operation_id,NEW.strapi_user_document_id,NEW.strapi_account_document_id,
    'tombstone','pending_deletion','completed',1,'single') ON CONFLICT (operation_id) DO NOTHING;
  SELECT * INTO operation FROM music_identity_lifecycle_operations WHERE operation_id=NEW.lifecycle_operation_id;
  IF operation.strapi_user_document_id IS DISTINCT FROM NEW.strapi_user_document_id
     OR operation.strapi_account_document_id IS DISTINCT FROM NEW.strapi_account_document_id
     OR operation.requested_identity_status <> 'pending_deletion' OR operation.operation_state <> 'completed'
     OR NOT (
       operation.operation_kind='tombstone' AND operation.operation_phase='single'
       OR operation.operation_kind='delete' AND operation.operation_phase IN ('prepared','finalized')
     ) THEN RAISE EXCEPTION 'lifecycle operation mismatch'; END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION reject_unauthorized_music_identity_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('music.lifecycle_delete_authorized',true) IS DISTINCT FROM 'true'
     OR nullif(current_setting('music.lifecycle_operation_id',true),'') IS NULL THEN
    RAISE EXCEPTION 'direct user delete forbidden; use finalize_music_identity_deletion';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER users_reject_unauthorized_music_identity_delete
BEFORE DELETE ON users
FOR EACH ROW EXECUTE FUNCTION reject_unauthorized_music_identity_delete();

CREATE FUNCTION finalize_music_identity_deletion(
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
  IF p_operation_id IS NULL OR length(p_operation_id)=0 THEN RAISE EXCEPTION 'lifecycle operation ID is required'; END IF;
  IF p_reason IS NULL OR length(p_reason)=0 THEN RAISE EXCEPTION 'delete reason is required'; END IF;

  SELECT * INTO identity FROM users WHERE id=p_user_id;
  IF NOT FOUND THEN
    SELECT * INTO tombstone FROM music_identity_tombstones WHERE lifecycle_operation_id=p_operation_id;
    SELECT * INTO operation FROM music_identity_lifecycle_operations WHERE operation_id=p_operation_id;
    IF FOUND AND tombstone.lifecycle_operation_id=p_operation_id
       AND operation.operation_kind='delete' AND operation.operation_phase='finalized'
       AND operation.operation_state='completed' THEN
      RETURN false;
    END IF;
    RAISE EXCEPTION 'immutable external identity not found';
  END IF;

  PERFORM lock_music_identity_pair(identity.strapi_user_document_id, identity.strapi_account_document_id);
  SELECT * INTO identity FROM users WHERE id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    SELECT * INTO tombstone FROM music_identity_tombstones WHERE lifecycle_operation_id=p_operation_id;
    SELECT * INTO operation FROM music_identity_lifecycle_operations WHERE operation_id=p_operation_id;
    IF FOUND AND tombstone.lifecycle_operation_id=p_operation_id
       AND operation.operation_kind='delete' AND operation.operation_phase='finalized'
       AND operation.operation_state='completed' THEN
      RETURN false;
    END IF;
    RAISE EXCEPTION 'immutable external identity not found';
  END IF;

  SELECT * INTO operation FROM music_identity_lifecycle_operations WHERE operation_id=p_operation_id FOR UPDATE;
  IF NOT FOUND THEN
    next_session_version := identity.session_version + 1;
    INSERT INTO music_identity_lifecycle_operations(
      operation_id,strapi_user_document_id,strapi_account_document_id,operation_kind,
      requested_identity_status,operation_state,attempt_count,result_session_version,operation_phase
    ) VALUES (
      p_operation_id,identity.strapi_user_document_id,identity.strapi_account_document_id,'delete',
      'pending_deletion','completed',1,next_session_version,'prepared'
    ) RETURNING * INTO operation;
  ELSE
    IF operation.strapi_user_document_id IS DISTINCT FROM identity.strapi_user_document_id
       OR operation.strapi_account_document_id IS DISTINCT FROM identity.strapi_account_document_id
       OR operation.operation_kind <> 'delete' OR operation.requested_identity_status <> 'pending_deletion'
       OR operation.operation_state <> 'completed' OR operation.operation_phase NOT IN ('prepared','finalized') THEN
      RAISE EXCEPTION 'lifecycle operation mismatch';
    END IF;
    next_session_version := operation.result_session_version;
  END IF;

  IF operation.operation_phase='finalized' THEN
    SELECT * INTO tombstone FROM music_identity_tombstones WHERE lifecycle_operation_id=p_operation_id;
    IF FOUND THEN RETURN false; END IF;
    RAISE EXCEPTION 'finalized lifecycle operation lacks tombstone';
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
  PERFORM set_config('music.lifecycle_delete_reason',p_reason,true);
  DELETE FROM users WHERE id=p_user_id;
  UPDATE music_identity_lifecycle_operations
  SET operation_phase='finalized' WHERE operation_id=p_operation_id;
  RETURN true;
END;
$$;
