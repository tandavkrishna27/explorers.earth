CREATE OR REPLACE FUNCTION music_compact_publication_operations(p_limit integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  candidate record;
  compacted_count integer := 0;
  deleted_count integer;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'publication operation compaction limit is invalid';
  END IF;

  WITH expired_archive AS (
    SELECT archive.music_user_id,archive.idempotency_key_hash
      FROM public.music_publication_operation_archive archive
     WHERE archive.archived_at<=clock_timestamp()-interval '30 days'
     ORDER BY archive.archived_at,archive.music_user_id,archive.idempotency_key_hash
     LIMIT p_limit
     FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.music_publication_operation_archive archive
   USING expired_archive
   WHERE archive.music_user_id=expired_archive.music_user_id
     AND archive.idempotency_key_hash=expired_archive.idempotency_key_hash;
  GET DIAGNOSTICS compacted_count = ROW_COUNT;

  FOR candidate IN
    SELECT operation.music_user_id,operation.idempotency_key_hash,
           operation.request_fingerprint,operation.request_mode,
           operation.completed_at,operation.expires_at
      FROM public.music_publication_operations operation
     WHERE operation.operation_state='replay_expired'
       AND operation.expires_at<=clock_timestamp()
     ORDER BY operation.expires_at,operation.music_user_id,operation.idempotency_key_hash
     LIMIT GREATEST(p_limit-compacted_count,0)
     FOR UPDATE SKIP LOCKED
  LOOP
    INSERT INTO public.music_publication_operation_archive(
      music_user_id,idempotency_key_hash,request_fingerprint,request_mode,
      completed_at,expires_at,archived_at
    ) VALUES (
      candidate.music_user_id,candidate.idempotency_key_hash,
      candidate.request_fingerprint,candidate.request_mode,
      candidate.completed_at,candidate.expires_at,clock_timestamp()
    ) ON CONFLICT (music_user_id,idempotency_key_hash) DO NOTHING;

    DELETE FROM public.music_publication_operations operation
     WHERE operation.music_user_id=candidate.music_user_id
       AND operation.idempotency_key_hash=candidate.idempotency_key_hash
       AND EXISTS (
         SELECT 1
           FROM public.music_publication_operation_archive archive
          WHERE archive.music_user_id=operation.music_user_id
            AND archive.idempotency_key_hash=operation.idempotency_key_hash
            AND archive.request_fingerprint=operation.request_fingerprint
            AND archive.request_mode=operation.request_mode
            AND archive.completed_at=operation.completed_at
            AND archive.expires_at=operation.expires_at
       );
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    compacted_count := compacted_count + deleted_count;
  END LOOP;

  RETURN compacted_count;
END;
$$;
