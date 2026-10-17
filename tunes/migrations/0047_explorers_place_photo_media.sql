-- Place photos are owned media in S3, not provider URLs. Ticket 5.1.
--
-- Owner decision, 2026-10-07: all photos and media are stored in S3. The Strapi blob kept
-- provider photo entries inside Place_Details and the gallery rendered them directly from
-- the provider; that is what this replaces. A provider photo is imported into an owned
-- media asset and referenced here, which is exactly how recommendation_book_covers and
-- recommendation_movie_media already handle provider imagery.
--
-- The consequence worth stating: the gallery keeps working during a provider outage, it
-- costs nothing per render, and the bytes are subject to the same upload bounds, storage
-- environment and account-deletion path as any other owned media. The cost is that an
-- import step exists and provider imagery is retained rather than re-fetched.
--
-- Ordered slots, bounded at ten, because a gallery has an order the owner arranged and
-- the public projection concatenates it with their own uploads.
LOCK TABLE public.creator_accounts IN EXCLUSIVE MODE;
LOCK TABLE public.recommendations,public.media_assets IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE public.recommendation_place_photos (
 recommendation_id uuid NOT NULL,account_id uuid NOT NULL,
 category text NOT NULL DEFAULT 'places' CHECK(category='places'),
 slot_index integer NOT NULL CHECK(slot_index BETWEEN 0 AND 9),
 media_id uuid NOT NULL,
 PRIMARY KEY(recommendation_id,slot_index),UNIQUE(recommendation_id,account_id,slot_index),
 FOREIGN KEY(recommendation_id,account_id,category) REFERENCES public.recommendations(id,account_id,category) ON DELETE CASCADE,
 FOREIGN KEY(media_id,account_id) REFERENCES public.media_assets(id,account_id) ON DELETE RESTRICT
);
CREATE INDEX recommendation_place_photos_asset_idx ON public.recommendation_place_photos(media_id,account_id);
CREATE INDEX recommendation_place_photos_account_idx ON public.recommendation_place_photos(account_id,recommendation_id);

CREATE FUNCTION public.guard_recommendation_place_photo() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE target uuid; item record;
BEGIN
 IF TG_TABLE_NAME='media_assets' THEN
  target:=NEW.id;
  IF EXISTS(SELECT 1 FROM public.recommendation_place_photos WHERE media_id=target) AND NOT EXISTS(
   SELECT 1 FROM public.media_assets WHERE id=target AND status='ready' AND purpose='recommendation' AND mime_type IN ('image/png','image/jpeg','image/gif','image/webp') AND byte_size BETWEEN 1 AND 5242880)
  THEN RAISE EXCEPTION 'Place photo media must remain ready owned recommendation image' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='recommendations' THEN
  IF EXISTS(SELECT 1 FROM public.recommendation_place_photos WHERE recommendation_id=NEW.id) AND NOT EXISTS(SELECT 1 FROM public.recommendations WHERE id=NEW.id AND category='places')
  THEN RAISE EXCEPTION 'Place photo requires a Places recommendation' USING ERRCODE='23514'; END IF;
 ELSE
  -- Check the final slot state, permitting a detach or replacement in this transaction.
  SELECT * INTO item FROM public.recommendation_place_photos WHERE recommendation_id=NEW.recommendation_id AND slot_index=NEW.slot_index;
  IF FOUND THEN
   PERFORM 1 FROM public.media_assets WHERE id=item.media_id AND account_id=item.account_id AND status='ready' AND purpose='recommendation' AND mime_type IN ('image/png','image/jpeg','image/gif','image/webp') AND byte_size BETWEEN 1 AND 5242880 FOR SHARE;
   IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.recommendations WHERE id=item.recommendation_id AND account_id=item.account_id AND category='places') THEN RAISE EXCEPTION 'Invalid Place photo relation' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER recommendation_place_photos_guard AFTER INSERT OR UPDATE ON public.recommendation_place_photos DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_recommendation_place_photo();
CREATE CONSTRAINT TRIGGER media_assets_place_photo_guard AFTER UPDATE ON public.media_assets DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_recommendation_place_photo();
CREATE CONSTRAINT TRIGGER recommendations_place_photo_guard AFTER UPDATE ON public.recommendations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_recommendation_place_photo();

REVOKE ALL ON public.recommendation_place_photos FROM PUBLIC,music_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.recommendation_place_photos TO music_runtime;
REVOKE ALL ON FUNCTION public.guard_recommendation_place_photo() FROM PUBLIC,music_runtime;

CREATE TRIGGER recommendation_place_photos_content_revision_insert AFTER INSERT ON public.recommendation_place_photos REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.explorers_content_revision_insert();
CREATE TRIGGER recommendation_place_photos_content_revision_update AFTER UPDATE ON public.recommendation_place_photos REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.explorers_content_revision_update();
CREATE TRIGGER recommendation_place_photos_content_revision_delete AFTER DELETE ON public.recommendation_place_photos REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.explorers_content_revision_delete();

-- Re-declared from the 0046 bodies with recommendation_place_photos added, generated
-- rather than retyped.

CREATE OR REPLACE FUNCTION public.explorers_content_revision_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE scope record; scope_sql text;
BEGIN
 IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME NOT IN ('collections','recommendations','collection_items','collection_media','recommendation_media','recommendation_display_overrides','book_recommendation_context','recommendation_book_covers','movie_recommendation_context','product_recommendation_context','place_recommendation_context','recommendation_place_photos','recommendation_taxonomy','recommendation_movie_media','recommendation_app_screenshots','category_recommendation_pins','account_category_pin_state') THEN
  RAISE EXCEPTION 'Invalid category revision trigger source' USING ERRCODE='42501';
 END IF;
 IF TG_TABLE_NAME='collection_media' THEN
  scope_sql := 'SELECT m.account_id,c.category FROM new_rows m JOIN public.collections c ON c.id=m.collection_id AND c.account_id=m.account_id';
 ELSIF TG_TABLE_NAME IN ('recommendation_media','recommendation_display_overrides','book_recommendation_context','recommendation_book_covers','movie_recommendation_context','product_recommendation_context','place_recommendation_context','recommendation_place_photos','recommendation_taxonomy','recommendation_movie_media','recommendation_app_screenshots') THEN
  scope_sql := 'SELECT m.account_id,r.category FROM new_rows m JOIN public.recommendations r ON r.id=m.recommendation_id AND r.account_id=m.account_id';
 ELSE
  scope_sql := 'SELECT account_id,category FROM new_rows';
 END IF;
 -- Transition tables describe OLD and NEW scopes. A parent DELETE independently
 -- covers its OLD scope when its cascading media parent lookup no longer exists.
 FOR scope IN EXECUTE 'SELECT DISTINCT account_id,category FROM (' || scope_sql || ') scopes ORDER BY account_id,category' LOOP
  -- 44031 is the dedicated two-int category namespace. Hash collisions serialize.
  PERFORM pg_catalog.pg_advisory_xact_lock(44031,pg_catalog.hashtext(scope.account_id::text || ':' || scope.category));
  INSERT INTO public.account_category_content_state(account_id,category,revision)
   VALUES(scope.account_id,scope.category,1)
   ON CONFLICT(account_id,category) DO UPDATE SET revision=public.account_category_content_state.revision+1;
 END LOOP;
 RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.explorers_content_revision_update() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE scope record; scope_sql text;
BEGIN
 IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME NOT IN ('collections','recommendations','collection_items','collection_media','recommendation_media','recommendation_display_overrides','book_recommendation_context','recommendation_book_covers','movie_recommendation_context','product_recommendation_context','place_recommendation_context','recommendation_place_photos','recommendation_taxonomy','recommendation_movie_media','recommendation_app_screenshots','category_recommendation_pins','account_category_pin_state') THEN
  RAISE EXCEPTION 'Invalid category revision trigger source' USING ERRCODE='42501';
 END IF;
 IF TG_TABLE_NAME='collection_media' THEN
  scope_sql := 'SELECT m.account_id,c.category FROM old_rows m JOIN public.collections c ON c.id=m.collection_id AND c.account_id=m.account_id UNION SELECT m.account_id,c.category FROM new_rows m JOIN public.collections c ON c.id=m.collection_id AND c.account_id=m.account_id';
 ELSIF TG_TABLE_NAME IN ('recommendation_media','recommendation_display_overrides','book_recommendation_context','recommendation_book_covers','movie_recommendation_context','product_recommendation_context','place_recommendation_context','recommendation_place_photos','recommendation_taxonomy','recommendation_movie_media','recommendation_app_screenshots') THEN
  scope_sql := 'SELECT m.account_id,r.category FROM old_rows m JOIN public.recommendations r ON r.id=m.recommendation_id AND r.account_id=m.account_id UNION SELECT m.account_id,r.category FROM new_rows m JOIN public.recommendations r ON r.id=m.recommendation_id AND r.account_id=m.account_id';
 ELSE
  scope_sql := 'SELECT account_id,category FROM old_rows UNION SELECT account_id,category FROM new_rows';
 END IF;
 -- Transition tables describe OLD and NEW scopes. A parent DELETE independently
 -- covers its OLD scope when its cascading media parent lookup no longer exists.
 FOR scope IN EXECUTE 'SELECT DISTINCT account_id,category FROM (' || scope_sql || ') scopes ORDER BY account_id,category' LOOP
  -- 44031 is the dedicated two-int category namespace. Hash collisions serialize.
  PERFORM pg_catalog.pg_advisory_xact_lock(44031,pg_catalog.hashtext(scope.account_id::text || ':' || scope.category));
  INSERT INTO public.account_category_content_state(account_id,category,revision)
   VALUES(scope.account_id,scope.category,1)
   ON CONFLICT(account_id,category) DO UPDATE SET revision=public.account_category_content_state.revision+1;
 END LOOP;
 RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.explorers_content_revision_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE scope record; scope_sql text;
BEGIN
 IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME NOT IN ('collections','recommendations','collection_items','collection_media','recommendation_media','recommendation_display_overrides','book_recommendation_context','recommendation_book_covers','movie_recommendation_context','product_recommendation_context','place_recommendation_context','recommendation_place_photos','recommendation_taxonomy','recommendation_movie_media','recommendation_app_screenshots','category_recommendation_pins','account_category_pin_state') THEN
  RAISE EXCEPTION 'Invalid category revision trigger source' USING ERRCODE='42501';
 END IF;
 IF TG_TABLE_NAME='collection_media' THEN
  scope_sql := 'SELECT m.account_id,c.category FROM old_rows m JOIN public.collections c ON c.id=m.collection_id AND c.account_id=m.account_id';
 ELSIF TG_TABLE_NAME IN ('recommendation_media','recommendation_display_overrides','book_recommendation_context','recommendation_book_covers','movie_recommendation_context','product_recommendation_context','place_recommendation_context','recommendation_place_photos','recommendation_taxonomy','recommendation_movie_media','recommendation_app_screenshots') THEN
  scope_sql := 'SELECT m.account_id,r.category FROM old_rows m JOIN public.recommendations r ON r.id=m.recommendation_id AND r.account_id=m.account_id';
 ELSE
  scope_sql := 'SELECT account_id,category FROM old_rows';
 END IF;
 -- Transition tables describe OLD and NEW scopes. A parent DELETE independently
 -- covers its OLD scope when its cascading media parent lookup no longer exists.
 FOR scope IN EXECUTE 'SELECT DISTINCT account_id,category FROM (' || scope_sql || ') scopes ORDER BY account_id,category' LOOP
  -- 44031 is the dedicated two-int category namespace. Hash collisions serialize.
  PERFORM pg_catalog.pg_advisory_xact_lock(44031,pg_catalog.hashtext(scope.account_id::text || ':' || scope.category));
  INSERT INTO public.account_category_content_state(account_id,category,revision)
   VALUES(scope.account_id,scope.category,1)
   ON CONFLICT(account_id,category) DO UPDATE SET revision=public.account_category_content_state.revision+1;
 END LOOP;
 RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.purge_explorers_account_content(target_account uuid,target_operation uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE current_status text; eligible boolean; removed_collections integer; removed_recommendations integer; scope_category text;
BEGIN
 SELECT status INTO current_status FROM public.creator_accounts WHERE id=target_account FOR UPDATE;
 IF current_status IS DISTINCT FROM 'pending_deletion' THEN
  RAISE EXCEPTION 'Terminal deletion authority required' USING ERRCODE='42501';
 END IF;
 -- Account -> sorted category -> operation/aggregate. Retain counters forever;
 -- zero-row statement triggers derive no scopes on an idempotent purge retry.
 FOR scope_category IN SELECT category FROM unnest(ARRAY['apps','books','games','guides','movies','people','places','products']) category ORDER BY category LOOP
  PERFORM pg_catalog.pg_advisory_xact_lock(44031,pg_catalog.hashtext(target_account::text || ':' || scope_category));
 END LOOP;
 SELECT true INTO eligible FROM public.account_lifecycle_operations o JOIN public.creator_accounts a ON a.id=o.account_id
   WHERE o.id=target_operation AND o.account_id=target_account AND o.kind='delete' AND o.state='running'
     AND a.deletion_requested_at<=clock_timestamp() FOR UPDATE OF o;
 IF eligible IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Matching running terminal deletion required' USING ERRCODE='42501';
 END IF;
 UPDATE public.analytics_event_receipts SET retired_at=coalesce(retired_at,clock_timestamp()),event_id=NULL WHERE account_id=target_account AND event_id IS NOT NULL;
 DELETE FROM public.analytics_events WHERE account_id=target_account;
 DELETE FROM public.collections WHERE account_id=target_account;
 GET DIAGNOSTICS removed_collections=ROW_COUNT;
 DELETE FROM public.recommendation_app_screenshots WHERE account_id=target_account;
 DELETE FROM public.recommendation_place_photos WHERE account_id=target_account;
 DELETE FROM public.recommendation_movie_media WHERE account_id=target_account;
 DELETE FROM public.recommendations WHERE account_id=target_account;
 GET DIAGNOSTICS removed_recommendations=ROW_COUNT;
 DELETE FROM public.account_category_pin_state WHERE account_id=target_account;
 RETURN removed_collections+removed_recommendations;
END $$;
