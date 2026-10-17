-- C5 durable idempotency authority for local Music credential revocation.
-- No foreign key targets users: the immutable operation record must survive
-- later identity deletion and remain bound to the retired numeric resource.
CREATE TABLE music_credential_revocation_operations (
  operation_id text PRIMARY KEY,
  music_user_id integer NOT NULL,
  strapi_user_document_id text NOT NULL,
  strapi_account_document_id text NOT NULL,
  reason text NOT NULL,
  expected_session_version integer NOT NULL,
  result_session_version integer NOT NULL,
  operation_state text NOT NULL DEFAULT 'completed',
  completed_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT music_credential_revocation_operation_id_check CHECK (
    operation_id ~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  ),
  CONSTRAINT music_credential_revocation_user_check CHECK (music_user_id > 0),
  CONSTRAINT music_credential_revocation_subject_check CHECK (length(strapi_user_document_id) > 0),
  CONSTRAINT music_credential_revocation_account_check CHECK (length(strapi_account_document_id) > 0),
  CONSTRAINT music_credential_revocation_reason_check CHECK (
    reason IN ('logout_all','entitlement_security_revocation','credential_compromise')
  ),
  CONSTRAINT music_credential_revocation_expected_version_check CHECK (expected_session_version > 0),
  CONSTRAINT music_credential_revocation_result_version_check CHECK (
    result_session_version = expected_session_version + 1
  ),
  CONSTRAINT music_credential_revocation_state_check CHECK (operation_state = 'completed'),
  CONSTRAINT music_credential_revocation_version_unique UNIQUE (music_user_id, expected_session_version)
);

CREATE INDEX idx_music_credential_revocation_subject
  ON music_credential_revocation_operations(strapi_user_document_id, strapi_account_document_id);

COMMENT ON TABLE music_credential_revocation_operations IS
  'Durable exact-operation authority for atomic Music session-version revocation';
