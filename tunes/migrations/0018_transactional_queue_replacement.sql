ALTER TABLE users
  ADD COLUMN music_queue_revision BIGINT NOT NULL DEFAULT 0;

CREATE TABLE music_owner_operations (
  music_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operation TEXT NOT NULL,
  idempotency_key_hash TEXT NOT NULL CHECK (idempotency_key_hash ~ '^[a-f0-9]{64}$'),
  request_hash TEXT NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  status_code INTEGER NOT NULL,
  response_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (music_user_id, operation, idempotency_key_hash),
  CHECK (expires_at > created_at)
);

CREATE INDEX music_owner_operations_expiry_idx
  ON music_owner_operations(expires_at, music_user_id, operation);

REVOKE ALL ON music_owner_operations FROM PUBLIC;
REVOKE ALL ON music_owner_operations FROM music_runtime;
GRANT SELECT, INSERT, DELETE ON music_owner_operations TO music_runtime;
GRANT SELECT, UPDATE(music_queue_revision) ON users TO music_runtime;
