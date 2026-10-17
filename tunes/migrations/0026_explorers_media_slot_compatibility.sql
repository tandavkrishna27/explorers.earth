-- Correct the deferred attachment policy without changing historical migrations.
-- Profile/background uploads are interchangeable across the three profile slots;
-- feed and claim-evidence media remain outside this profile attachment family.
CREATE OR REPLACE FUNCTION explorers_assert_ready_attachment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE asset_status text;
DECLARE asset_purpose text;
BEGIN
  SELECT status,purpose INTO asset_status,asset_purpose FROM media_assets
    WHERE id=NEW.media_id AND account_id=NEW.account_id FOR SHARE;
  IF asset_status IS DISTINCT FROM 'ready' THEN
    RAISE EXCEPTION 'attachment requires a ready owned asset of the correct purpose' USING ERRCODE='23514';
  END IF;
  IF TG_TABLE_NAME='profile_media' THEN
    IF NEW.slot NOT IN ('profile','background','wallpaper')
       OR asset_purpose NOT IN ('profile','background') THEN
      RAISE EXCEPTION 'attachment purpose mismatch' USING ERRCODE='23514';
    END IF;
  ELSIF asset_purpose IS DISTINCT FROM 'feed' THEN
    RAISE EXCEPTION 'feed attachment purpose mismatch' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
