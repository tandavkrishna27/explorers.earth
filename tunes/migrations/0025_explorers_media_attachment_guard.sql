-- Deferred checks cover direct SQL writers as well as the API's asset-first lock order.
CREATE FUNCTION explorers_assert_ready_attachment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE asset_status text;
DECLARE asset_purpose text;
BEGIN
  SELECT status,purpose INTO asset_status,asset_purpose FROM media_assets
    WHERE id=NEW.media_id AND account_id=NEW.account_id FOR SHARE;
  IF asset_status IS DISTINCT FROM 'ready' THEN
    RAISE EXCEPTION 'attachment requires a ready owned asset of the correct purpose' USING ERRCODE='23514';
  END IF;
  IF TG_TABLE_NAME='profile_media' THEN
    IF asset_purpose IS DISTINCT FROM NEW.slot THEN
      RAISE EXCEPTION 'attachment purpose mismatch' USING ERRCODE='23514';
    END IF;
  ELSIF asset_purpose IS DISTINCT FROM 'feed' THEN
    RAISE EXCEPTION 'feed attachment purpose mismatch' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER profile_media_ready_guard AFTER INSERT OR UPDATE OF media_id,account_id,slot ON profile_media
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION explorers_assert_ready_attachment();
CREATE CONSTRAINT TRIGGER profile_feed_ready_guard AFTER INSERT OR UPDATE OF media_id,account_id ON profile_feed_items
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.media_id IS NOT NULL)
  EXECUTE FUNCTION explorers_assert_ready_attachment();

CREATE FUNCTION explorers_assert_no_unready_references() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_status text;
BEGIN
  SELECT status INTO current_status FROM media_assets WHERE id=NEW.id;
  IF current_status <> 'ready' AND (
    EXISTS (SELECT 1 FROM profile_media WHERE media_id=NEW.id) OR
    EXISTS (SELECT 1 FROM profile_feed_items WHERE media_id=NEW.id)) THEN
    RAISE EXCEPTION 'referenced media must remain ready' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER media_asset_reference_guard AFTER UPDATE OF status ON media_assets
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION explorers_assert_no_unready_references();
