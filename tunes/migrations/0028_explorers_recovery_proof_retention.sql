-- Bounded proof expiry with no direct runtime DELETE capability.
CREATE FUNCTION purge_expired_account_recovery_proofs(batch_size integer) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE removed integer;
BEGIN
  IF batch_size < 1 OR batch_size > 100 OR batch_size IS NULL THEN
    RAISE EXCEPTION 'invalid recovery-proof purge batch size';
  END IF;
  WITH due AS (
    SELECT id FROM public.account_recovery_proofs
    WHERE expires_at<=clock_timestamp()-interval '24 hours'
    ORDER BY expires_at,id LIMIT batch_size FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.account_recovery_proofs p USING due WHERE p.id=due.id;
  GET DIAGNOSTICS removed=ROW_COUNT;
  RETURN removed;
END $$;
REVOKE ALL ON FUNCTION purge_expired_account_recovery_proofs(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION purge_expired_account_recovery_proofs(integer) TO music_runtime;
