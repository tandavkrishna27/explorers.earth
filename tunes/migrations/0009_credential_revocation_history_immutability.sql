-- Credential revocation operations are durable idempotency authority. Once
-- written, neither application code nor the runtime database role may rewrite
-- or remove any part of the operation/resource/version tuple.
CREATE FUNCTION reject_music_credential_revocation_history_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'credential revocation history is immutable';
END;
$$;

CREATE TRIGGER music_credential_revocation_history_immutability
BEFORE UPDATE OR DELETE ON music_credential_revocation_operations
FOR EACH ROW EXECUTE FUNCTION reject_music_credential_revocation_history_mutation();
