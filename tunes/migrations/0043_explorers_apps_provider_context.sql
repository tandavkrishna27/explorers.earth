-- Apps typed facts are shared on the entity; screenshots are owned media per
-- recommendation. Ticket 4.3.
--
-- Screenshots are a slotted FK relation to media_assets rather than a URL array. Owner
-- decision, on two grounds: /itunes-api/search is retired, so Apps has no approved
-- provider whose image URLs could be referenced, and every delivered multi-image set
-- already works this way - recommendation_book_covers and recommendation_movie_media.
-- The target schema's own rule is that uploaded media always links through FK tables and
-- is never embedded as a URL. This also inherits the existing upload, byte-size, storage
-- environment and account-deletion paths instead of needing its own.
--
-- platforms stays a text[] because that matches delivered precedent for non-URL arrays
-- (book authors and subjects, movie genres). Deliberately absent: taxonomy. app_category
-- maps to recommendation_taxonomy in the target schema, but ticket 4.3's behaviour
-- contract and all six of its test obligations never mention it, and its labels are
-- owner-supplied seed inputs with no provider document to attest. It belongs to its own
-- ticket rather than riding in here.
--
-- URL columns carry scheme CHECKs as defence in depth. The contract validates them too,
-- as Books does, but 4.3 owes an explicit unsafe_outbound_scheme_is_rejected proof and a
-- database that cannot hold a javascript: URL is the stronger half of it.
LOCK TABLE public.creator_accounts IN EXCLUSIVE MODE;
LOCK TABLE public.entities,public.recommendations,public.media_assets IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE public.app_entity_details (
 entity_id uuid PRIMARY KEY REFERENCES public.entities(id) ON DELETE CASCADE,
 app_url text NOT NULL CHECK(app_url ~ '^https?://' AND length(app_url) BETWEEN 8 AND 2048),
 developer text CHECK(developer IS NULL OR length(developer) BETWEEN 1 AND 200),
 logo_url text CHECK(logo_url IS NULL OR (logo_url ~ '^https?://' AND length(logo_url) BETWEEN 8 AND 2048)),
 description text CHECK(description IS NULL OR length(description) BETWEEN 1 AND 8192),
 download_url text CHECK(download_url IS NULL OR (download_url ~ '^https?://' AND length(download_url) BETWEEN 8 AND 2048)),
 price_tier text CHECK(price_tier IS NULL OR price_tier IN ('Free','Freemium','Paid','Subscription')),
 platforms text[] NOT NULL DEFAULT '{}' CHECK(array_length(platforms,1) IS NULL OR array_length(platforms,1)<=16)
);
CREATE INDEX app_entity_details_platforms_idx ON public.app_entity_details USING gin(platforms);

CREATE TABLE public.recommendation_app_screenshots (
 recommendation_id uuid NOT NULL,account_id uuid NOT NULL,
 category text NOT NULL DEFAULT 'apps' CHECK(category='apps'),
 slot_index integer NOT NULL CHECK(slot_index BETWEEN 0 AND 9),
 media_id uuid NOT NULL,
 PRIMARY KEY(recommendation_id,slot_index),UNIQUE(recommendation_id,account_id,slot_index),
 FOREIGN KEY(recommendation_id,account_id,category) REFERENCES public.recommendations(id,account_id,category) ON DELETE CASCADE,
 FOREIGN KEY(media_id,account_id) REFERENCES public.media_assets(id,account_id) ON DELETE RESTRICT
);
CREATE INDEX recommendation_app_screenshots_asset_idx ON public.recommendation_app_screenshots(media_id,account_id);
CREATE INDEX recommendation_app_screenshots_account_idx ON public.recommendation_app_screenshots(account_id,recommendation_id);

CREATE FUNCTION public.guard_app_entity_details() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_TABLE_NAME='entities' THEN
  IF NEW.kind<>'app' AND EXISTS(SELECT 1 FROM public.app_entity_details WHERE entity_id=NEW.id) THEN RAISE EXCEPTION 'App detail kind mismatch' USING ERRCODE='23514'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM public.entities WHERE id=NEW.entity_id AND kind='app') THEN RAISE EXCEPTION 'App detail kind mismatch' USING ERRCODE='23514'; END IF;
 END IF;RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER app_entity_details_kind_guard AFTER INSERT OR UPDATE ON public.app_entity_details DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_app_entity_details();
CREATE CONSTRAINT TRIGGER entities_app_details_kind_guard AFTER UPDATE ON public.entities DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_app_entity_details();

CREATE FUNCTION public.guard_recommendation_app_screenshot() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE target uuid; item record;
BEGIN
 IF TG_TABLE_NAME='media_assets' THEN
  target:=NEW.id;
  IF EXISTS(SELECT 1 FROM public.recommendation_app_screenshots WHERE media_id=target) AND NOT EXISTS(
   SELECT 1 FROM public.media_assets WHERE id=target AND status='ready' AND purpose='recommendation' AND mime_type IN ('image/png','image/jpeg','image/gif','image/webp') AND byte_size BETWEEN 1 AND 5242880)
  THEN RAISE EXCEPTION 'App screenshot media must remain ready owned recommendation image' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='recommendations' THEN
  IF EXISTS(SELECT 1 FROM public.recommendation_app_screenshots WHERE recommendation_id=NEW.id) AND NOT EXISTS(SELECT 1 FROM public.recommendations WHERE id=NEW.id AND category='apps')
  THEN RAISE EXCEPTION 'App screenshot requires an Apps recommendation' USING ERRCODE='23514'; END IF;
 ELSE
  -- Check the final slot state, permitting a detach or replacement in this transaction.
  SELECT * INTO item FROM public.recommendation_app_screenshots WHERE recommendation_id=NEW.recommendation_id AND slot_index=NEW.slot_index;
  IF FOUND THEN
   PERFORM 1 FROM public.media_assets WHERE id=item.media_id AND account_id=item.account_id AND status='ready' AND purpose='recommendation' AND mime_type IN ('image/png','image/jpeg','image/gif','image/webp') AND byte_size BETWEEN 1 AND 5242880 FOR SHARE;
   IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.recommendations WHERE id=item.recommendation_id AND account_id=item.account_id AND category='apps') THEN RAISE EXCEPTION 'Invalid App screenshot relation' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER recommendation_app_screenshots_guard AFTER INSERT OR UPDATE ON public.recommendation_app_screenshots DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_recommendation_app_screenshot();
CREATE CONSTRAINT TRIGGER media_assets_app_screenshot_guard AFTER UPDATE ON public.media_assets DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_recommendation_app_screenshot();
CREATE CONSTRAINT TRIGGER recommendations_app_screenshot_guard AFTER UPDATE ON public.recommendations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_recommendation_app_screenshot();

REVOKE ALL ON public.app_entity_details,public.recommendation_app_screenshots FROM PUBLIC,music_runtime;
GRANT SELECT,INSERT ON public.app_entity_details TO music_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.recommendation_app_screenshots TO music_runtime;
REVOKE ALL ON FUNCTION public.guard_app_entity_details(),public.guard_recommendation_app_screenshot() FROM PUBLIC,music_runtime;

-- The three content-revision functions and the account purge below are re-declared from
-- their 0038 bodies with this table added, generated rather than retyped, so none of the
-- hardening they already carry is silently dropped.
CREATE OR REPLACE FUNCTION public.explorers_content_revision_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE scope record; scope_sql text;
BEGIN
 IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME NOT IN ('collections','recommendations','collection_items','collection_media','recommendation_media','recommendation_display_overrides','book_recommendation_context','recommendation_book_covers','movie_recommendation_context','recommendation_taxonomy','recommendation_movie_media','recommendation_app_screenshots','category_recommendation_pins','account_category_pin_state') THEN
  RAISE EXCEPTION 'Invalid category revision trigger source' USING ERRCODE='42501';
 END IF;
 IF TG_TABLE_NAME='collection_media' THEN
  scope_sql := 'SELECT m.account_id,c.category FROM new_rows m JOIN public.collections c ON c.id=m.collection_id AND c.account_id=m.account_id';
 ELSIF TG_TABLE_NAME IN ('recommendation_media','recommendation_display_overrides','book_recommendation_context','recommendation_book_covers','movie_recommendation_context','recommendation_taxonomy','recommendation_movie_media','recommendation_app_screenshots') THEN
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
 IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME NOT IN ('collections','recommendations','collection_items','collection_media','recommendation_media','recommendation_display_overrides','book_recommendation_context','recommendation_book_covers','movie_recommendation_context','recommendation_taxonomy','recommendation_movie_media','recommendation_app_screenshots','category_recommendation_pins','account_category_pin_state') THEN
  RAISE EXCEPTION 'Invalid category revision trigger source' USING ERRCODE='42501';
 END IF;
 IF TG_TABLE_NAME='collection_media' THEN
  scope_sql := 'SELECT m.account_id,c.category FROM old_rows m JOIN public.collections c ON c.id=m.collection_id AND c.account_id=m.account_id UNION SELECT m.account_id,c.category FROM new_rows m JOIN public.collections c ON c.id=m.collection_id AND c.account_id=m.account_id';
 ELSIF TG_TABLE_NAME IN ('recommendation_media','recommendation_display_overrides','book_recommendation_context','recommendation_book_covers','movie_recommendation_context','recommendation_taxonomy','recommendation_movie_media','recommendation_app_screenshots') THEN
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
 IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME NOT IN ('collections','recommendations','collection_items','collection_media','recommendation_media','recommendation_display_overrides','book_recommendation_context','recommendation_book_covers','movie_recommendation_context','recommendation_taxonomy','recommendation_movie_media','recommendation_app_screenshots','category_recommendation_pins','account_category_pin_state') THEN
  RAISE EXCEPTION 'Invalid category revision trigger source' USING ERRCODE='42501';
 END IF;
 IF TG_TABLE_NAME='collection_media' THEN
  scope_sql := 'SELECT m.account_id,c.category FROM old_rows m JOIN public.collections c ON c.id=m.collection_id AND c.account_id=m.account_id';
 ELSIF TG_TABLE_NAME IN ('recommendation_media','recommendation_display_overrides','book_recommendation_context','recommendation_book_covers','movie_recommendation_context','recommendation_taxonomy','recommendation_movie_media','recommendation_app_screenshots') THEN
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

CREATE TRIGGER recommendation_app_screenshots_content_revision_insert AFTER INSERT ON public.recommendation_app_screenshots REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.explorers_content_revision_insert();
CREATE TRIGGER recommendation_app_screenshots_content_revision_update AFTER UPDATE ON public.recommendation_app_screenshots REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.explorers_content_revision_update();
CREATE TRIGGER recommendation_app_screenshots_content_revision_delete AFTER DELETE ON public.recommendation_app_screenshots REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.explorers_content_revision_delete();

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
 DELETE FROM public.recommendation_movie_media WHERE account_id=target_account;
 DELETE FROM public.recommendations WHERE account_id=target_account;
 GET DIAGNOSTICS removed_recommendations=ROW_COUNT;
 DELETE FROM public.account_category_pin_state WHERE account_id=target_account;
 RETURN removed_collections+removed_recommendations;
END $$;
