CREATE TABLE music_publication_operation_archive (
  music_user_id integer NOT NULL CHECK (music_user_id > 0),
  idempotency_key_hash character(64) NOT NULL CHECK (idempotency_key_hash ~ '^[a-f0-9]{64}$'),
  request_fingerprint character(64) NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  request_mode character varying(16) NOT NULL CHECK (request_mode IN ('private','unlisted','public')),
  completed_at timestamp with time zone NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  archived_at timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (music_user_id, idempotency_key_hash),
  CHECK (expires_at = completed_at + interval '24 hours'),
  CHECK (archived_at >= expires_at)
);

CREATE OR REPLACE FUNCTION reject_music_publication_archive_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'publication operation archive is immutable';
END;
$$;

CREATE TRIGGER music_publication_operation_archive_immutability
  BEFORE UPDATE OR DELETE ON music_publication_operation_archive
  FOR EACH ROW EXECUTE FUNCTION reject_music_publication_archive_mutation();

ALTER TABLE music_publication_operation_archive
  ENABLE ALWAYS TRIGGER music_publication_operation_archive_immutability;

CREATE OR REPLACE FUNCTION music_lookup_publication_operation_archive(
  p_music_user_id integer,
  p_idempotency_key_hash text
)
RETURNS TABLE(request_fingerprint text, request_mode text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT archive.request_fingerprint::text, archive.request_mode::text
    FROM public.music_publication_operation_archive archive
   WHERE p_music_user_id > 0
     AND p_idempotency_key_hash ~ '^[a-f0-9]{64}$'
     AND archive.music_user_id=p_music_user_id
     AND archive.idempotency_key_hash=p_idempotency_key_hash
$$;

CREATE OR REPLACE FUNCTION enforce_music_publication_operation_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.operation_state='replay_expired'
        AND OLD.expires_at<=clock_timestamp()
        AND EXISTS (
          SELECT 1
            FROM public.music_publication_operation_archive archive
           WHERE archive.music_user_id=OLD.music_user_id
             AND archive.idempotency_key_hash=OLD.idempotency_key_hash
             AND archive.request_fingerprint=OLD.request_fingerprint
             AND archive.request_mode=OLD.request_mode
             AND archive.completed_at=OLD.completed_at
             AND archive.expires_at=OLD.expires_at
        ) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'publication operation history is immutable except archived replay-expired deletion';
  END IF;

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

  FOR candidate IN
    SELECT operation.music_user_id,operation.idempotency_key_hash,
           operation.request_fingerprint,operation.request_mode,
           operation.completed_at,operation.expires_at
      FROM public.music_publication_operations operation
     WHERE operation.operation_state='replay_expired'
       AND operation.expires_at<=clock_timestamp()
     ORDER BY operation.expires_at,operation.music_user_id,operation.idempotency_key_hash
     LIMIT p_limit
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

REVOKE ALL ON music_publication_operation_archive FROM PUBLIC;
REVOKE ALL ON music_publication_operation_archive FROM music_runtime;
REVOKE ALL ON FUNCTION reject_music_publication_archive_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION music_lookup_publication_operation_archive(integer,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION music_compact_publication_operations(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reject_music_publication_archive_mutation() TO music_runtime;
GRANT EXECUTE ON FUNCTION music_lookup_publication_operation_archive(integer,text) TO music_runtime;
GRANT EXECUTE ON FUNCTION music_compact_publication_operations(integer) TO music_runtime;
