CREATE TABLE music_identity_lifecycle_operations (
  operation_id text PRIMARY KEY,
  strapi_user_document_id text NOT NULL,
  strapi_account_document_id text NOT NULL,
  operation_kind text NOT NULL,
  requested_identity_status text NOT NULL,
  operation_state text NOT NULL DEFAULT 'requested',
  attempt_count integer NOT NULL DEFAULT 0,
  result_session_version integer,
  error_code text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CHECK (length(operation_id) > 0),
  CHECK (length(strapi_user_document_id) > 0),
  CHECK (length(strapi_account_document_id) > 0),
  CHECK (operation_kind IN ('provision','suspend','reactivate','request_deletion','cancel_deletion','tombstone')),
  CHECK (requested_identity_status IN ('active','suspended','pending_deletion')),
  CHECK (operation_state IN ('requested','running','completed','failed','cancelled')),
  CHECK (attempt_count >= 0),
  CHECK (result_session_version IS NULL OR result_session_version >= 1)
);
CREATE INDEX idx_music_identity_lifecycle_operations_identity
  ON music_identity_lifecycle_operations(strapi_user_document_id,created_at);

INSERT INTO music_identity_lifecycle_operations(
  operation_id,strapi_user_document_id,strapi_account_document_id,operation_kind,
  requested_identity_status,operation_state,attempt_count,result_session_version,created_at,updated_at
)
SELECT lifecycle_operation_id,strapi_user_document_id,strapi_account_document_id,'provision',
  identity_status,'completed',GREATEST(lifecycle_attempt_count,1),session_version,created_at,updated_at
FROM users;

INSERT INTO music_identity_lifecycle_operations(
  operation_id,strapi_user_document_id,strapi_account_document_id,operation_kind,
  requested_identity_status,operation_state,attempt_count,created_at,updated_at
)
SELECT lifecycle_operation_id,strapi_user_document_id,strapi_account_document_id,'tombstone',
  'pending_deletion','completed',1,created_at,created_at
FROM music_identity_tombstones;

ALTER TABLE users
  DROP CONSTRAINT users_lifecycle_operation_id_unique,
  DROP CONSTRAINT users_lifecycle_state_check,
  ADD CONSTRAINT users_lifecycle_state_check CHECK (lifecycle_state IN ('none','requested','running','completed','failed','cancelled')),
  ADD CONSTRAINT users_lifecycle_operation_id_fk FOREIGN KEY (lifecycle_operation_id)
    REFERENCES music_identity_lifecycle_operations(operation_id);

ALTER TABLE music_identity_tombstones
  ADD CONSTRAINT music_identity_tombstone_operation_fk FOREIGN KEY (lifecycle_operation_id)
    REFERENCES music_identity_lifecycle_operations(operation_id);

CREATE FUNCTION enforce_music_lifecycle_operation_state() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.strapi_user_document_id IS DISTINCT FROM OLD.strapi_user_document_id
     OR NEW.strapi_account_document_id IS DISTINCT FROM OLD.strapi_account_document_id
     OR NEW.operation_kind IS DISTINCT FROM OLD.operation_kind
     OR NEW.requested_identity_status IS DISTINCT FROM OLD.requested_identity_status THEN
    RAISE EXCEPTION 'lifecycle operation identity is immutable';
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

CREATE FUNCTION lock_music_identity_pair(user_document_id text, account_document_id text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('music:user:' || user_document_id, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('music:account:' || account_document_id, 0));
END;
$$;

CREATE FUNCTION enforce_music_identity_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE operation music_identity_lifecycle_operations%ROWTYPE;
BEGIN
  PERFORM lock_music_identity_pair(NEW.strapi_user_document_id, NEW.strapi_account_document_id);
  IF EXISTS (SELECT 1 FROM music_identity_tombstones
             WHERE strapi_user_document_id=NEW.strapi_user_document_id
                OR strapi_account_document_id=NEW.strapi_account_document_id) THEN
    RAISE EXCEPTION 'immutable external identity is tombstoned';
  END IF;
  INSERT INTO music_identity_lifecycle_operations(
    operation_id,strapi_user_document_id,strapi_account_document_id,operation_kind,
    requested_identity_status,operation_state,attempt_count,result_session_version
  ) VALUES (NEW.lifecycle_operation_id,NEW.strapi_user_document_id,NEW.strapi_account_document_id,
    'provision','active','completed',1,NEW.session_version) ON CONFLICT (operation_id) DO NOTHING;
  SELECT * INTO operation FROM music_identity_lifecycle_operations WHERE operation_id=NEW.lifecycle_operation_id;
  IF operation.strapi_user_document_id IS DISTINCT FROM NEW.strapi_user_document_id
     OR operation.strapi_account_document_id IS DISTINCT FROM NEW.strapi_account_document_id
     OR operation.operation_kind <> 'provision' OR operation.requested_identity_status <> 'active'
     OR operation.operation_state <> 'completed' THEN RAISE EXCEPTION 'lifecycle operation mismatch'; END IF;
  NEW.lifecycle_state := 'completed';
  NEW.lifecycle_attempt_count := GREATEST(NEW.lifecycle_attempt_count,operation.attempt_count);
  RETURN NEW;
END;
$$;

CREATE FUNCTION enforce_music_tombstone_insert() RETURNS trigger
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
    requested_identity_status,operation_state,attempt_count
  ) VALUES (NEW.lifecycle_operation_id,NEW.strapi_user_document_id,NEW.strapi_account_document_id,
    'tombstone','pending_deletion','completed',1) ON CONFLICT (operation_id) DO NOTHING;
  SELECT * INTO operation FROM music_identity_lifecycle_operations WHERE operation_id=NEW.lifecycle_operation_id;
  IF operation.strapi_user_document_id IS DISTINCT FROM NEW.strapi_user_document_id
     OR operation.strapi_account_document_id IS DISTINCT FROM NEW.strapi_account_document_id
     OR operation.operation_kind <> 'tombstone' OR operation.requested_identity_status <> 'pending_deletion'
     OR operation.operation_state <> 'completed' THEN RAISE EXCEPTION 'lifecycle operation mismatch'; END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION retain_music_identity_tombstone_on_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  requested_operation_id text;
  requested_reason text;
BEGIN
  requested_operation_id := nullif(current_setting('music.lifecycle_operation_id',true),'');
  requested_reason := nullif(current_setting('music.lifecycle_delete_reason',true),'');
  IF requested_operation_id IS NULL THEN
    requested_operation_id := 'automatic-delete:' || OLD.id::text || ':' || txid_current()::text;
  END IF;
  INSERT INTO music_identity_tombstones(
    strapi_user_document_id,strapi_account_document_id,reason,lifecycle_operation_id
  ) VALUES (
    OLD.strapi_user_document_id,OLD.strapi_account_document_id,
    coalesce(requested_reason,'direct-database-delete'),requested_operation_id
  );
  RETURN OLD;
END;
$$;

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
      (OLD.identity_status IN ('active','suspended') AND NEW.identity_status='pending_deletion' AND operation.operation_kind='request_deletion') OR
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

CREATE TRIGGER users_music_identity_insert BEFORE INSERT ON users
FOR EACH ROW EXECUTE FUNCTION enforce_music_identity_insert();
CREATE TRIGGER music_identity_tombstone_insert BEFORE INSERT ON music_identity_tombstones
FOR EACH ROW EXECUTE FUNCTION enforce_music_tombstone_insert();
CREATE TRIGGER users_retain_music_identity_tombstone AFTER DELETE ON users
FOR EACH ROW EXECUTE FUNCTION retain_music_identity_tombstone_on_delete();
