CREATE TABLE music_publication_operations (
  music_user_id integer NOT NULL CHECK (music_user_id > 0),
  idempotency_key_hash character(64) NOT NULL CHECK (idempotency_key_hash ~ '^[a-f0-9]{64}$'),
  request_fingerprint character(64) NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  request_mode character varying(16) NOT NULL CHECK (request_mode IN ('private','unlisted','public')),
  operation_state character varying(24) NOT NULL CHECK (operation_state IN ('completed','replay_expired')),
  created_at timestamp with time zone NOT NULL,
  completed_at timestamp with time zone NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL,
  shredded_at timestamp with time zone,
  response_key_id character varying(64),
  response_nonce bytea,
  response_ciphertext bytea,
  response_tag bytea,
  PRIMARY KEY (music_user_id, idempotency_key_hash),
  CHECK (completed_at >= created_at),
  CHECK (expires_at = completed_at + interval '24 hours'),
  CHECK (updated_at >= completed_at),
  CHECK (
    (operation_state='completed'
      AND shredded_at IS NULL
      AND response_key_id IS NOT NULL
      AND response_key_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'
      AND octet_length(response_nonce)=12
      AND octet_length(response_ciphertext) BETWEEN 1 AND 4096
      AND octet_length(response_tag)=16)
    OR
    (operation_state='replay_expired'
      AND shredded_at IS NOT NULL
      AND response_key_id IS NULL
      AND response_nonce IS NULL
      AND response_ciphertext IS NULL
      AND response_tag IS NULL)
  )
);

CREATE INDEX music_publication_operations_expiry_idx
  ON music_publication_operations(expires_at, music_user_id, idempotency_key_hash)
  WHERE response_ciphertext IS NOT NULL;

CREATE OR REPLACE FUNCTION enforce_music_publication_operation_immutability()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.music_user_id IS DISTINCT FROM OLD.music_user_id
      OR NEW.idempotency_key_hash IS DISTINCT FROM OLD.idempotency_key_hash
      OR NEW.request_fingerprint IS DISTINCT FROM OLD.request_fingerprint
      OR NEW.request_mode IS DISTINCT FROM OLD.request_mode
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
      OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    RAISE EXCEPTION 'publication operation identity is immutable';
  END IF;

  IF NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NEW;
  END IF;

  IF OLD.operation_state='completed'
      AND NEW.operation_state='replay_expired'
      AND OLD.shredded_at IS NULL
      AND NEW.shredded_at IS NOT NULL
      AND NEW.response_key_id IS NULL
      AND NEW.response_nonce IS NULL
      AND NEW.response_ciphertext IS NULL
      AND NEW.response_tag IS NULL
      AND NEW.updated_at >= OLD.updated_at THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'publication operation history is immutable except one-way response shredding';
END;
$$;

CREATE TRIGGER music_publication_operation_immutability
  BEFORE UPDATE OR DELETE ON music_publication_operations
  FOR EACH ROW EXECUTE FUNCTION enforce_music_publication_operation_immutability();

ALTER TABLE music_publication_operations
  ENABLE ALWAYS TRIGGER music_publication_operation_immutability;

REVOKE ALL ON music_publication_operations FROM PUBLIC;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON music_publication_operations FROM music_runtime;
GRANT SELECT, INSERT, UPDATE
  ON music_publication_operations TO music_runtime;
