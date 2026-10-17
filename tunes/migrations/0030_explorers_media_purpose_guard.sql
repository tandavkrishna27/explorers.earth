-- Preserve typed attachment compatibility after an asset-only purpose mutation.
-- Unreferenced assets remain mutable; legitimate upload/lifecycle status changes
-- and the existing profile/background slot compatibility are unchanged.
CREATE OR REPLACE FUNCTION explorers_assert_no_unready_references() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE current_status text; current_purpose text;
BEGIN
 SELECT status,purpose INTO current_status,current_purpose FROM public.media_assets WHERE id=NEW.id;
 IF current_status <> 'ready' AND (
   EXISTS(SELECT 1 FROM public.profile_media WHERE media_id=NEW.id) OR
   EXISTS(SELECT 1 FROM public.profile_feed_items WHERE media_id=NEW.id) OR
   EXISTS(SELECT 1 FROM public.collection_media WHERE media_id=NEW.id) OR
   EXISTS(SELECT 1 FROM public.recommendation_media WHERE media_id=NEW.id))
 THEN RAISE EXCEPTION 'Referenced media must remain ready' USING ERRCODE='23514'; END IF;
 IF (current_purpose IS DISTINCT FROM 'collection' AND
     EXISTS(SELECT 1 FROM public.collection_media WHERE media_id=NEW.id)) OR
    (current_purpose IS DISTINCT FROM 'recommendation' AND
     EXISTS(SELECT 1 FROM public.recommendation_media WHERE media_id=NEW.id))
 THEN RAISE EXCEPTION 'Referenced content media must retain compatible purpose' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
-- A deferred guard checks the final state, permitting detach+purpose-change in
-- one transaction. The forward attachment guard SHARE-locks the same asset;
-- asset UPDATE locks therefore serialize concurrent purpose changes/attachment.
DROP TRIGGER media_asset_reference_guard ON media_assets;
CREATE CONSTRAINT TRIGGER media_asset_reference_guard AFTER UPDATE OF status,purpose ON media_assets
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION explorers_assert_no_unready_references();
