ALTER TABLE users
  ADD COLUMN strapi_user_document_id text NOT NULL,
  ADD COLUMN strapi_account_document_id text NOT NULL,
  ADD COLUMN strapi_username_snapshot text,
  ADD COLUMN strapi_email_snapshot text,
  ADD COLUMN strapi_account_name_snapshot text,
  ADD COLUMN strapi_account_type_snapshot text,
  ADD COLUMN strapi_account_mobile_snapshot text,
  ADD COLUMN identity_status text NOT NULL DEFAULT 'active',
  ADD COLUMN session_version integer NOT NULL DEFAULT 1,
  ADD COLUMN last_identity_sync_at timestamp with time zone,
  ADD COLUMN entitlement_state text NOT NULL DEFAULT 'unknown',
  ADD COLUMN entitlement_version bigint NOT NULL DEFAULT 0,
  ADD COLUMN entitlement_source_updated_at timestamp with time zone,
  ADD COLUMN last_reconciled_at timestamp with time zone,
  ADD COLUMN reconciliation_observation_version bigint NOT NULL DEFAULT 0,
  ADD COLUMN reconciliation_mismatch_count integer NOT NULL DEFAULT 0,
  ADD COLUMN lifecycle_operation_id text NOT NULL,
  ADD COLUMN lifecycle_state text NOT NULL DEFAULT 'none',
  ADD COLUMN lifecycle_attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN lifecycle_last_attempt_at timestamp with time zone,
  ADD COLUMN lifecycle_error_code text,
  ADD COLUMN lifecycle_retention_stage text NOT NULL DEFAULT 'identity-active',
  ADD COLUMN guest_capability_hash text NOT NULL,
  ADD COLUMN guest_capability_issued_at timestamp with time zone NOT NULL DEFAULT now(),
  ADD COLUMN guest_capability_rotated_at timestamp with time zone,
  ADD COLUMN guest_capability_revoked_at timestamp with time zone,
  ADD COLUMN guest_discoverable boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT users_strapi_user_document_id_unique UNIQUE (strapi_user_document_id),
  ADD CONSTRAINT users_strapi_account_document_id_unique UNIQUE (strapi_account_document_id),
  ADD CONSTRAINT users_lifecycle_operation_id_unique UNIQUE (lifecycle_operation_id),
  ADD CONSTRAINT users_guest_capability_hash_unique UNIQUE (guest_capability_hash),
  ADD CONSTRAINT users_identity_status_check CHECK (identity_status IN ('active','suspended','pending_deletion')),
  ADD CONSTRAINT users_session_version_check CHECK (session_version >= 1),
  ADD CONSTRAINT users_entitlement_state_check CHECK (entitlement_state IN ('unknown','included','eligible','entitled','revoked')),
  ADD CONSTRAINT users_entitlement_version_check CHECK (entitlement_version >= 0),
  ADD CONSTRAINT users_entitlement_freshness_check CHECK (entitlement_version = 0 OR entitlement_source_updated_at IS NOT NULL),
  ADD CONSTRAINT users_reconciliation_version_check CHECK (reconciliation_observation_version >= 0),
  ADD CONSTRAINT users_reconciliation_mismatch_check CHECK (reconciliation_mismatch_count >= 0),
  ADD CONSTRAINT users_lifecycle_state_check CHECK (lifecycle_state IN ('none','requested','running','completed','failed')),
  ADD CONSTRAINT users_lifecycle_attempt_count_check CHECK (lifecycle_attempt_count >= 0),
  ADD CONSTRAINT users_lifecycle_operation_id_check CHECK (length(lifecycle_operation_id) > 0),
  ADD CONSTRAINT users_guest_capability_hash_check CHECK (guest_capability_hash ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT users_guest_capability_dates_check CHECK (
    (guest_capability_rotated_at IS NULL OR guest_capability_rotated_at >= guest_capability_issued_at) AND
    (guest_capability_revoked_at IS NULL OR guest_capability_revoked_at >= guest_capability_issued_at)
  );

COMMENT ON COLUMN users.guest_url IS 'Non-secret public discoverability slug; never a guest authorization capability';
COMMENT ON COLUMN users.guest_capability_hash IS 'SHA-256 hash of the random guest capability; plaintext is never persisted';

CREATE INDEX idx_users_selected_account ON users(strapi_account_document_id);
CREATE INDEX idx_users_reconciliation_scan ON users(identity_status, last_reconciled_at, reconciliation_mismatch_count);
CREATE INDEX idx_users_entitlement_freshness ON users(entitlement_state, entitlement_source_updated_at);
CREATE INDEX idx_users_lifecycle_scan ON users(lifecycle_state, lifecycle_last_attempt_at);
CREATE INDEX idx_users_guest_discoverability ON users(guest_discoverable) WHERE guest_discoverable = true;

CREATE TABLE music_identity_tombstones (
  strapi_user_document_id text PRIMARY KEY,
  strapi_account_document_id text NOT NULL UNIQUE,
  reason text NOT NULL,
  lifecycle_operation_id text NOT NULL UNIQUE,
  retention_stage text NOT NULL DEFAULT 'tombstone-retained',
  source_updated_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CHECK (length(strapi_user_document_id) > 0),
  CHECK (length(strapi_account_document_id) > 0),
  CHECK (length(lifecycle_operation_id) > 0)
);
CREATE INDEX idx_music_identity_tombstones_account ON music_identity_tombstones(strapi_account_document_id);

CREATE FUNCTION enforce_music_identity_immutability() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.strapi_user_document_id IS DISTINCT FROM OLD.strapi_user_document_id THEN
    RAISE EXCEPTION 'immutable strapi_user_document_id';
  END IF;
  IF NEW.strapi_account_document_id IS DISTINCT FROM OLD.strapi_account_document_id THEN
    RAISE EXCEPTION 'immutable strapi_account_document_id';
  END IF;
  IF NEW.lifecycle_operation_id IS DISTINCT FROM OLD.lifecycle_operation_id THEN
    RAISE EXCEPTION 'immutable lifecycle_operation_id';
  END IF;
  IF NEW.session_version < OLD.session_version THEN
    RAISE EXCEPTION 'session_version cannot decrease';
  END IF;
  IF NEW.identity_status IS DISTINCT FROM OLD.identity_status AND NOT (
    (OLD.identity_status = 'active' AND NEW.identity_status IN ('suspended','pending_deletion')) OR
    (OLD.identity_status = 'suspended' AND NEW.identity_status IN ('active','pending_deletion')) OR
    (OLD.identity_status = 'pending_deletion' AND NEW.identity_status = 'suspended')
  ) THEN
    RAISE EXCEPTION 'invalid identity lifecycle transition: % -> %', OLD.identity_status, NEW.identity_status;
  END IF;
  IF NEW.guest_capability_hash IS DISTINCT FROM OLD.guest_capability_hash
     AND NEW.guest_capability_rotated_at IS NULL THEN
    RAISE EXCEPTION 'guest capability rotation metadata required';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_music_identity_immutability
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION enforce_music_identity_immutability();
