CREATE OR REPLACE FUNCTION enforce_music_publication_operation_immutability()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.operation_state<>'completed' THEN
      RAISE EXCEPTION 'publication operation must begin completed';
    END IF;
    NEW.created_at := transaction_timestamp();
    NEW.completed_at := NEW.created_at;
    NEW.expires_at := NEW.completed_at + interval '24 hours';
    NEW.updated_at := NEW.completed_at;
    RETURN NEW;
  END IF;

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
      AND clock_timestamp() >= OLD.expires_at
      AND OLD.shredded_at IS NULL
      AND NEW.shredded_at IS NOT NULL
      AND NEW.shredded_at >= OLD.expires_at
      AND NEW.response_key_id IS NULL
      AND NEW.response_nonce IS NULL
      AND NEW.response_ciphertext IS NULL
      AND NEW.response_tag IS NULL
      AND NEW.updated_at >= OLD.updated_at THEN
    RETURN NEW;
  END IF;

  IF OLD.operation_state='completed' AND clock_timestamp() < OLD.expires_at THEN
    RAISE EXCEPTION 'publication operation cannot be shredded before response expiry';
  END IF;

  RAISE EXCEPTION 'publication operation history is immutable except one-way response shredding';
END;
$$;

DROP TRIGGER music_publication_operation_immutability ON music_publication_operations;
CREATE TRIGGER music_publication_operation_immutability
  BEFORE INSERT OR UPDATE OR DELETE ON music_publication_operations
  FOR EACH ROW EXECUTE FUNCTION enforce_music_publication_operation_immutability();

ALTER TABLE music_publication_operations
  ENABLE ALWAYS TRIGGER music_publication_operation_immutability;
