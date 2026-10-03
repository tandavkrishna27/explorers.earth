-- Canonical account lifecycle, replay receipts and bounded deletion feedback.
CREATE TABLE application_command_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES creator_accounts(id) ON DELETE RESTRICT,
  operation text NOT NULL,
  idempotency_key_hash bytea NOT NULL CHECK (octet_length(idempotency_key_hash)=32),
  request_hash bytea NOT NULL CHECK (octet_length(request_hash)=32),
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','retired')),
  response jsonb,
  replay_until timestamptz NOT NULL DEFAULT now()+interval '24 hours',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id,operation,idempotency_key_hash),
  CONSTRAINT application_receipt_response_check CHECK ((status='completed')=(response IS NOT NULL))
);
CREATE INDEX application_receipts_retention_idx ON application_command_receipts(status,replay_until);

CREATE TABLE deletion_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES creator_accounts(id) ON DELETE RESTRICT,
  user_id text REFERENCES auth_user(id) ON DELETE SET NULL,
  reason text,
  purged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,account_id),
  CONSTRAINT deletion_feedback_lifecycle_check CHECK (
    (reason IS NOT NULL AND purged_at IS NULL AND length(btrim(reason)) BETWEEN 1 AND 2000)
    OR (reason IS NULL AND purged_at IS NOT NULL))
);
CREATE INDEX deletion_feedback_account_idx ON deletion_feedback(account_id);

CREATE TABLE account_lifecycle_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES creator_accounts(id) ON DELETE RESTRICT,
  requested_by_user_id text REFERENCES auth_user(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('deactivate','delete','reactivate','cancel_deletion')),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','running','succeeded','failed','cancelled')),
  expected_revision bigint NOT NULL CHECK (expected_revision BETWEEN 1 AND 9007199254740991),
  feedback_id uuid,
  receipt_id uuid NOT NULL UNIQUE REFERENCES application_command_receipts(id) ON DELETE RESTRICT,
  failure_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(id,account_id),
  CONSTRAINT lifecycle_feedback_fk FOREIGN KEY(feedback_id,account_id) REFERENCES deletion_feedback(id,account_id) ON DELETE RESTRICT,
  CONSTRAINT lifecycle_delete_feedback_check CHECK ((kind='delete')=(feedback_id IS NOT NULL))
);
CREATE UNIQUE INDEX account_lifecycle_running_idx ON account_lifecycle_operations(account_id)
  WHERE state IN ('pending','running');
CREATE INDEX account_lifecycle_status_idx ON account_lifecycle_operations(state,created_at,id);

REVOKE ALL ON application_command_receipts,deletion_feedback,account_lifecycle_operations FROM PUBLIC,music_runtime;
GRANT SELECT,INSERT,UPDATE ON application_command_receipts,deletion_feedback,account_lifecycle_operations TO music_runtime;
