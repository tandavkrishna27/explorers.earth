-- Canonical numeric retirement is independent of Strapi identity tombstones.
-- Historical canonical releases did not retain their numeric ID, so no reliable
-- backfill exists. This ledger protects releases committed after this migration.
CREATE TABLE public.canonical_music_numeric_retirements (
  music_user_id integer PRIMARY KEY CHECK (music_user_id>0),
  account_id uuid NOT NULL,
  lifecycle_operation_id uuid NOT NULL,
  retired_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(lifecycle_operation_id,account_id)
    REFERENCES public.account_lifecycle_operations(id,account_id) ON DELETE RESTRICT
);

CREATE FUNCTION guard_canonical_music_numeric_retirement() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'canonical Music numeric retirement is immutable';
  END IF;
  PERFORM lock_music_numeric_user_id(NEW.music_user_id);
  IF current_setting('music.lifecycle_delete_authorized',true) IS DISTINCT FROM 'true'
     OR nullif(current_setting('music.lifecycle_user_id',true),'') IS DISTINCT FROM NEW.music_user_id::text
     OR nullif(current_setting('music.lifecycle_operation_id',true),'') IS DISTINCT FROM NEW.lifecycle_operation_id::text
     OR NOT EXISTS (
       SELECT 1 FROM public.users u
       JOIN public.account_music_identity mi ON mi.music_user_id=u.id
       JOIN public.account_lifecycle_operations o ON o.account_id=mi.account_id
       JOIN public.creator_accounts a ON a.id=o.account_id
       WHERE u.id=NEW.music_user_id AND u.strapi_user_document_id IS NULL
         AND u.strapi_account_document_id IS NULL AND mi.account_id=NEW.account_id
         AND o.id=NEW.lifecycle_operation_id AND o.kind='delete'
         AND a.status='pending_deletion'
     ) THEN
    RAISE EXCEPTION 'canonical Music retirement requires authorized owned account deletion';
  END IF;
  NEW.retired_at := clock_timestamp();
  RETURN NEW;
END;
$$;
CREATE TRIGGER canonical_music_numeric_retirement_insert BEFORE INSERT
ON public.canonical_music_numeric_retirements
FOR EACH ROW EXECUTE FUNCTION guard_canonical_music_numeric_retirement();
CREATE TRIGGER canonical_music_numeric_retirement_immutable BEFORE UPDATE OR DELETE
ON public.canonical_music_numeric_retirements
FOR EACH ROW EXECUTE FUNCTION guard_canonical_music_numeric_retirement();

-- A primary-key UPDATE bypasses the INSERT guard; numeric keys never change.
CREATE FUNCTION reject_music_numeric_user_id_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'numeric Music user ID is immutable'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER users_music_numeric_id_immutable BEFORE UPDATE OF id ON public.users
FOR EACH ROW EXECUTE FUNCTION reject_music_numeric_user_id_update();

CREATE OR REPLACE FUNCTION enforce_music_identity_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE operation music_identity_lifecycle_operations%ROWTYPE;
BEGIN
  PERFORM lock_music_numeric_user_id(NEW.id);
  IF EXISTS (SELECT 1 FROM music_identity_tombstones WHERE music_user_id=NEW.id)
     OR EXISTS (SELECT 1 FROM public.canonical_music_numeric_retirements WHERE music_user_id=NEW.id) THEN
    RAISE EXCEPTION 'numeric Music user ID is retired';
  END IF;
  IF (NEW.strapi_user_document_id IS NULL) <> (NEW.strapi_account_document_id IS NULL) THEN
    RAISE EXCEPTION 'external identity must be complete or absent';
  END IF;
  IF NEW.strapi_user_document_id IS NULL THEN
    RETURN NEW;
  END IF;
  PERFORM lock_music_identity_pair(NEW.strapi_user_document_id, NEW.strapi_account_document_id);
  IF EXISTS (SELECT 1 FROM music_identity_tombstones
             WHERE strapi_user_document_id=NEW.strapi_user_document_id
                OR strapi_account_document_id=NEW.strapi_account_document_id) THEN
    RAISE EXCEPTION 'immutable external identity is tombstoned';
  END IF;
  INSERT INTO music_identity_lifecycle_operations(
    operation_id,strapi_user_document_id,strapi_account_document_id,music_user_id,operation_kind,
    requested_identity_status,operation_state,attempt_count,result_session_version
  ) VALUES (NEW.lifecycle_operation_id,NEW.strapi_user_document_id,NEW.strapi_account_document_id,NEW.id,
    'provision','active','completed',1,NEW.session_version) ON CONFLICT (operation_id) DO NOTHING;
  SELECT * INTO operation FROM music_identity_lifecycle_operations WHERE operation_id=NEW.lifecycle_operation_id;
  IF operation.strapi_user_document_id IS DISTINCT FROM NEW.strapi_user_document_id
     OR operation.strapi_account_document_id IS DISTINCT FROM NEW.strapi_account_document_id
     OR operation.music_user_id IS DISTINCT FROM NEW.id
     OR operation.operation_kind <> 'provision' OR operation.requested_identity_status <> 'active'
     OR operation.operation_state <> 'completed' THEN RAISE EXCEPTION 'lifecycle operation mismatch'; END IF;
  NEW.lifecycle_state := 'completed';
  NEW.lifecycle_attempt_count := GREATEST(NEW.lifecycle_attempt_count,operation.attempt_count);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION retain_music_identity_tombstone_on_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  requested_operation_id text;
  requested_reason text;
BEGIN
  IF OLD.strapi_user_document_id IS NULL AND OLD.strapi_account_document_id IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.canonical_music_numeric_retirements
      WHERE music_user_id=OLD.id
        AND lifecycle_operation_id::text=nullif(current_setting('music.lifecycle_operation_id',true),'')) THEN
      RAISE EXCEPTION 'canonical Music deletion requires numeric retirement evidence';
    END IF;
    RETURN OLD;
  END IF;
  requested_operation_id := nullif(current_setting('music.lifecycle_operation_id',true),'');
  requested_reason := nullif(current_setting('music.lifecycle_delete_reason',true),'');
  INSERT INTO music_identity_tombstones(
    strapi_user_document_id,strapi_account_document_id,music_user_id,reason,lifecycle_operation_id
  ) VALUES (
    OLD.strapi_user_document_id,OLD.strapi_account_document_id,OLD.id,
    coalesce(requested_reason,'database-delete'),requested_operation_id
  );
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION finalize_canonical_music_venue_deletion(
  p_music_user_id integer,
  p_operation_id text,
  p_reason text
) RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE identity users%ROWTYPE;
BEGIN
  IF p_music_user_id IS NULL OR p_music_user_id <= 0 THEN RAISE EXCEPTION 'numeric Music user ID is required'; END IF;
  IF p_operation_id IS NULL OR length(p_operation_id)=0 THEN RAISE EXCEPTION 'lifecycle operation ID is required'; END IF;
  IF p_reason IS NULL OR length(p_reason)=0 THEN RAISE EXCEPTION 'release reason is required'; END IF;

  PERFORM lock_music_numeric_user_id(p_music_user_id);
  SELECT * INTO identity FROM users WHERE id=p_music_user_id FOR UPDATE;
  -- Already released. Idempotent so a retried maintenance pass is not an error.
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.canonical_music_numeric_retirements
      WHERE music_user_id=p_music_user_id AND lifecycle_operation_id::text=p_operation_id) THEN RETURN false; END IF;
    RAISE EXCEPTION 'resource-bound canonical retirement history not found';
  END IF;

  IF identity.strapi_user_document_id IS NOT NULL OR identity.strapi_account_document_id IS NOT NULL THEN
    RAISE EXCEPTION 'legacy Music identity requires finalize_music_identity_deletion';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM account_music_identity mi
      JOIN account_lifecycle_operations o ON o.account_id=mi.account_id
      JOIN creator_accounts a ON a.id=o.account_id
     WHERE mi.music_user_id=p_music_user_id
       AND o.id::text=p_operation_id
       AND o.kind='delete'
       AND a.status='pending_deletion'
  ) THEN
    RAISE EXCEPTION 'canonical Music release requires a pending account deletion owning this venue';
  END IF;

  PERFORM set_config('music.lifecycle_delete_authorized','true',true);
  PERFORM set_config('music.lifecycle_operation_id',p_operation_id,true);
  PERFORM set_config('music.lifecycle_user_id',p_music_user_id::text,true);
  PERFORM set_config('music.lifecycle_delete_reason',p_reason,true);

  INSERT INTO public.canonical_music_numeric_retirements(music_user_id,account_id,lifecycle_operation_id)
    SELECT p_music_user_id,mi.account_id,o.id FROM account_music_identity mi
      JOIN account_lifecycle_operations o ON o.account_id=mi.account_id
    WHERE mi.music_user_id=p_music_user_id AND o.id::text=p_operation_id;

  DELETE FROM users WHERE id=p_music_user_id;

  PERFORM set_config('music.lifecycle_delete_authorized','false',true);
  PERFORM set_config('music.lifecycle_user_id','',true);
  PERFORM set_config('music.lifecycle_operation_id','',true);
  PERFORM set_config('music.lifecycle_delete_reason','',true);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION finalize_canonical_music_venue_deletion(integer,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finalize_canonical_music_venue_deletion(integer,text,text) TO music_runtime;

REVOKE ALL ON public.canonical_music_numeric_retirements FROM PUBLIC,music_runtime;
GRANT SELECT,INSERT ON public.canonical_music_numeric_retirements TO music_runtime;
REVOKE ALL ON FUNCTION guard_canonical_music_numeric_retirement(),reject_music_numeric_user_id_update() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION guard_canonical_music_numeric_retirement(),reject_music_numeric_user_id_update() TO music_runtime;
