CREATE TABLE music_reactivation_tokens (
  token_hash TEXT PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  strapi_user_id BIGINT NOT NULL CHECK (strapi_user_id > 0),
  strapi_user_document_id TEXT NOT NULL CHECK (length(strapi_user_document_id) BETWEEN 1 AND 512),
  strapi_account_document_id TEXT NOT NULL CHECK (length(strapi_account_document_id) BETWEEN 1 AND 512),
  operation_id UUID NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  lease_owner UUID,
  lease_expires_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT music_reactivation_token_lease_pair CHECK (
    (lease_owner IS NULL) = (lease_expires_at IS NULL)
  ),
  CONSTRAINT music_reactivation_token_expiry_after_issue CHECK (expires_at > created_at)
);

CREATE INDEX music_reactivation_tokens_expiry_idx
  ON music_reactivation_tokens (expires_at)
  WHERE consumed_at IS NULL AND revoked_at IS NULL;

CREATE FUNCTION enforce_music_reactivation_token_identity() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.token_hash IS DISTINCT FROM OLD.token_hash
      OR NEW.strapi_user_id IS DISTINCT FROM OLD.strapi_user_id
      OR NEW.strapi_user_document_id IS DISTINCT FROM OLD.strapi_user_document_id
      OR NEW.strapi_account_document_id IS DISTINCT FROM OLD.strapi_account_document_id
      OR NEW.operation_id IS DISTINCT FROM OLD.operation_id
      OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR (OLD.consumed_at IS NOT NULL AND NEW.consumed_at IS DISTINCT FROM OLD.consumed_at)
      OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at) THEN
    RAISE EXCEPTION 'reactivation token authority is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER music_reactivation_token_identity_immutability
  BEFORE UPDATE ON music_reactivation_tokens
  FOR EACH ROW EXECUTE FUNCTION enforce_music_reactivation_token_identity();

REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON music_identity_tombstones, music_reactivation_tokens FROM music_runtime;
GRANT SELECT, INSERT, UPDATE ON music_reactivation_tokens TO music_runtime;
