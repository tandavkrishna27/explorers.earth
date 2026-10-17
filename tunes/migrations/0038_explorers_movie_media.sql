-- Source-bound canonical provider image copies. Uploaded snapshots remain independent.
LOCK TABLE public.creator_accounts IN EXCLUSIVE MODE;
LOCK TABLE public.recommendations,public.media_assets,public.entities IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE public.recommendation_movie_media (
 recommendation_id uuid NOT NULL, account_id uuid NOT NULL, category text NOT NULL DEFAULT 'movies' CHECK(category='movies'),
 source_entity_id uuid NOT NULL REFERENCES public.entities(id) ON DELETE RESTRICT,
 source_external_kind text NOT NULL CHECK(source_external_kind IN('movie','tv')),
 source_external_id text NOT NULL CHECK(source_external_id ~ '^[1-9][0-9]{0,15}$' AND source_external_id::numeric<=9007199254740991),
 source_fetched_at bigint NOT NULL CHECK(source_fetched_at BETWEEN 0 AND 9007199254740991),
 source_mapping_version smallint NOT NULL CHECK(source_mapping_version=1),
 slot text NOT NULL CHECK(slot IN('poster','backdrop','cast')),slot_index integer NOT NULL CHECK(slot_index BETWEEN 0 AND 11),
 cast_ordinal integer,person_id bigint,credit_id text,media_id uuid NOT NULL,
 PRIMARY KEY(recommendation_id,slot_index),UNIQUE(recommendation_id,account_id,slot_index),
 FOREIGN KEY(recommendation_id,account_id,category) REFERENCES public.recommendations(id,account_id,category) ON DELETE CASCADE,
 FOREIGN KEY(media_id,account_id) REFERENCES public.media_assets(id,account_id) ON DELETE RESTRICT,
 CHECK((slot='poster' AND slot_index=0 AND cast_ordinal IS NULL AND person_id IS NULL AND credit_id IS NULL)
 OR (slot='backdrop' AND slot_index=1 AND cast_ordinal IS NULL AND person_id IS NULL AND credit_id IS NULL)
 OR (slot='cast' AND cast_ordinal IS NOT NULL AND person_id IS NOT NULL AND cast_ordinal BETWEEN 0 AND 9 AND slot_index=cast_ordinal+2 AND person_id BETWEEN 1 AND 9007199254740991 AND credit_id IS NOT NULL AND length(credit_id) BETWEEN 1 AND 200))
);
CREATE INDEX recommendation_movie_media_asset_idx ON public.recommendation_movie_media(media_id,account_id);
CREATE INDEX recommendation_movie_media_account_idx ON public.recommendation_movie_media(account_id,recommendation_id);
CREATE FUNCTION public.lock_movie_media_parent() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE target uuid; owner_account uuid;
BEGIN
 IF TG_OP='UPDATE' AND ROW(NEW.recommendation_id,NEW.account_id,NEW.category,NEW.source_entity_id,NEW.source_external_kind,NEW.source_external_id,NEW.source_fetched_at,NEW.source_mapping_version,NEW.slot,NEW.slot_index,NEW.cast_ordinal,NEW.person_id,NEW.credit_id) IS DISTINCT FROM ROW(OLD.recommendation_id,OLD.account_id,OLD.category,OLD.source_entity_id,OLD.source_external_kind,OLD.source_external_id,OLD.source_fetched_at,OLD.source_mapping_version,OLD.slot,OLD.slot_index,OLD.cast_ordinal,OLD.person_id,OLD.credit_id) THEN RAISE EXCEPTION 'Movie media parent and source are immutable' USING ERRCODE='23514'; END IF;
 target:=CASE WHEN TG_OP='DELETE' THEN OLD.recommendation_id ELSE NEW.recommendation_id END;
 owner_account:=CASE WHEN TG_OP='DELETE' THEN OLD.account_id ELSE NEW.account_id END;
 PERFORM 1 FROM public.creator_accounts WHERE id=owner_account FOR SHARE;
 PERFORM pg_advisory_xact_lock(44031,hashtext(owner_account::text||':movies'));
 PERFORM 1 FROM public.recommendations WHERE id=target AND account_id=owner_account FOR UPDATE;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;
CREATE FUNCTION public.validate_movie_media(target uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE item record; canonical_url text; rendition text;
BEGIN
 FOR item IN SELECT m.*,r.entity_id,r.category AS current_category,e.origin,e.kind,e.facts_version,d.media_type,d.poster_url,d.backdrop_url,d.cast_details,i.external_kind,i.external_id,i.fetched_at,i.source_url
 FROM public.recommendation_movie_media m JOIN public.recommendations r ON r.id=m.recommendation_id AND r.account_id=m.account_id
 LEFT JOIN public.entities e ON e.id=r.entity_id LEFT JOIN public.movie_entity_details d ON d.entity_id=e.id
 LEFT JOIN public.entity_identifiers i ON i.entity_id=e.id AND i.provider='tmdb' AND i.external_kind=d.media_type
 WHERE m.recommendation_id=target ORDER BY m.slot_index LOOP
  IF item.current_category IS DISTINCT FROM 'movies' OR item.entity_id IS DISTINCT FROM item.source_entity_id OR item.origin IS DISTINCT FROM 'provider' OR item.kind IS DISTINCT FROM 'movie'
   OR item.facts_version IS DISTINCT FROM item.source_mapping_version OR item.media_type IS DISTINCT FROM item.source_external_kind OR item.external_kind IS DISTINCT FROM item.source_external_kind
   OR item.external_id IS DISTINCT FROM item.source_external_id OR item.source_url IS DISTINCT FROM ('https://api.themoviedb.org/3/'||item.source_external_kind||'/'||item.source_external_id) OR (extract(epoch FROM item.fetched_at)*1000)::bigint IS DISTINCT FROM item.source_fetched_at THEN RAISE EXCEPTION 'Movie media source mismatch' USING ERRCODE='23514';END IF;
  IF item.slot='poster' THEN canonical_url:=item.poster_url;rendition:='w780';
  ELSIF item.slot='backdrop' THEN canonical_url:=item.backdrop_url;rendition:='w1280';
  ELSE
   IF (item.cast_details->item.cast_ordinal->>'personId')::bigint IS DISTINCT FROM item.person_id OR item.cast_details->item.cast_ordinal->>'creditId' IS DISTINCT FROM item.credit_id THEN RAISE EXCEPTION 'Movie cast ordinal source mismatch' USING ERRCODE='23514';END IF;
   canonical_url:=item.cast_details->item.cast_ordinal->>'profileUrl';rendition:='w185';
  END IF;
  IF canonical_url IS NULL OR canonical_url !~ ('^https://image\.tmdb\.org/t/p/'||rendition||'/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp|gif)$') THEN RAISE EXCEPTION 'Movie media canonical image unavailable' USING ERRCODE='23514';END IF;
  PERFORM 1 FROM public.media_assets WHERE id=item.media_id AND account_id=item.account_id AND status='ready' AND purpose='recommendation' AND mime_type IN('image/png','image/jpeg','image/webp','image/gif') AND byte_size BETWEEN 1 AND 5242880 FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Movie media must remain ready owned recommendation image' USING ERRCODE='23514';END IF;
 END LOOP;
END $$;
CREATE FUNCTION public.guard_movie_media() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE target uuid; source uuid; asset uuid; rec record;
BEGIN
 IF TG_TABLE_NAME='recommendation_movie_media' THEN
  target:=CASE WHEN TG_OP='DELETE' THEN OLD.recommendation_id ELSE NEW.recommendation_id END;PERFORM public.validate_movie_media(target);
 ELSIF TG_TABLE_NAME='recommendations' THEN PERFORM public.validate_movie_media(NEW.id);
 ELSIF TG_TABLE_NAME='media_assets' THEN
  asset:=NEW.id;FOR rec IN SELECT DISTINCT recommendation_id FROM public.recommendation_movie_media WHERE media_id=asset ORDER BY recommendation_id LOOP PERFORM public.validate_movie_media(rec.recommendation_id);END LOOP;
 ELSIF TG_TABLE_NAME='entities' THEN
  FOR rec IN SELECT DISTINCT recommendation_id FROM public.recommendation_movie_media WHERE source_entity_id=NEW.id ORDER BY recommendation_id LOOP PERFORM public.validate_movie_media(rec.recommendation_id);END LOOP;
 ELSE
  IF TG_OP='UPDATE' AND OLD.entity_id IS DISTINCT FROM NEW.entity_id THEN
   FOR rec IN SELECT DISTINCT recommendation_id FROM public.recommendation_movie_media WHERE source_entity_id=OLD.entity_id ORDER BY recommendation_id LOOP PERFORM public.validate_movie_media(rec.recommendation_id);END LOOP;
  END IF;
  source:=CASE WHEN TG_OP='DELETE' THEN OLD.entity_id ELSE NEW.entity_id END;
  FOR rec IN SELECT DISTINCT recommendation_id FROM public.recommendation_movie_media WHERE source_entity_id=source ORDER BY recommendation_id LOOP PERFORM public.validate_movie_media(rec.recommendation_id);END LOOP;
 END IF;RETURN NULL;
END $$;
CREATE TRIGGER movie_media_parent_lock BEFORE INSERT OR UPDATE OR DELETE ON public.recommendation_movie_media FOR EACH ROW EXECUTE FUNCTION public.lock_movie_media_parent();
CREATE CONSTRAINT TRIGGER movie_media_source_guard AFTER INSERT OR UPDATE OR DELETE ON public.recommendation_movie_media DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_movie_media();
CREATE CONSTRAINT TRIGGER movie_media_recommendation_reverse_guard AFTER UPDATE OF entity_id,category,account_id ON public.recommendations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_movie_media();
CREATE CONSTRAINT TRIGGER movie_media_asset_reverse_guard AFTER UPDATE OF account_id,status,purpose,mime_type,byte_size ON public.media_assets DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_movie_media();
CREATE CONSTRAINT TRIGGER movie_media_entity_reverse_guard AFTER UPDATE OF origin,kind,facts_version ON public.entities DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_movie_media();
CREATE CONSTRAINT TRIGGER movie_media_facts_reverse_guard AFTER UPDATE OR DELETE ON public.movie_entity_details DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_movie_media();
CREATE CONSTRAINT TRIGGER movie_media_identity_reverse_guard AFTER UPDATE OR DELETE ON public.entity_identifiers DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_movie_media();
REVOKE ALL ON public.recommendation_movie_media FROM PUBLIC,music_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.recommendation_movie_media TO music_runtime;
REVOKE ALL ON FUNCTION public.lock_movie_media_parent(),public.validate_movie_media(uuid),public.guard_movie_media() FROM PUBLIC,music_runtime;

CREATE OR REPLACE FUNCTION public.explorers_content_revision_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE scope record; scope_sql text;
BEGIN
 IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME NOT IN ('collections','recommendations','collection_items','collection_media','recommendation_media','recommendation_display_overrides','book_recommendation_context','recommendation_book_covers','movie_recommendation_context','recommendation_taxonomy','recommendation_movie_media','category_recommendation_pins','account_category_pin_state') THEN
  RAISE EXCEPTION 'Invalid category revision trigger source' USING ERRCODE='42501';
 END IF;
 IF TG_TABLE_NAME='collection_media' THEN
  scope_sql := 'SELECT m.account_id,c.category FROM new_rows m JOIN public.collections c ON c.id=m.collection_id AND c.account_id=m.account_id';
 ELSIF TG_TABLE_NAME IN ('recommendation_media','recommendation_display_overrides','book_recommendation_context','recommendation_book_covers','movie_recommendation_context','recommendation_taxonomy','recommendation_movie_media') THEN
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
 IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME NOT IN ('collections','recommendations','collection_items','collection_media','recommendation_media','recommendation_display_overrides','book_recommendation_context','recommendation_book_covers','movie_recommendation_context','recommendation_taxonomy','recommendation_movie_media','category_recommendation_pins','account_category_pin_state') THEN
  RAISE EXCEPTION 'Invalid category revision trigger source' USING ERRCODE='42501';
 END IF;
 IF TG_TABLE_NAME='collection_media' THEN
  scope_sql := 'SELECT m.account_id,c.category FROM old_rows m JOIN public.collections c ON c.id=m.collection_id AND c.account_id=m.account_id UNION SELECT m.account_id,c.category FROM new_rows m JOIN public.collections c ON c.id=m.collection_id AND c.account_id=m.account_id';
 ELSIF TG_TABLE_NAME IN ('recommendation_media','recommendation_display_overrides','book_recommendation_context','recommendation_book_covers','movie_recommendation_context','recommendation_taxonomy','recommendation_movie_media') THEN
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
 IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME NOT IN ('collections','recommendations','collection_items','collection_media','recommendation_media','recommendation_display_overrides','book_recommendation_context','recommendation_book_covers','movie_recommendation_context','recommendation_taxonomy','recommendation_movie_media','category_recommendation_pins','account_category_pin_state') THEN
  RAISE EXCEPTION 'Invalid category revision trigger source' USING ERRCODE='42501';
 END IF;
 IF TG_TABLE_NAME='collection_media' THEN
  scope_sql := 'SELECT m.account_id,c.category FROM old_rows m JOIN public.collections c ON c.id=m.collection_id AND c.account_id=m.account_id';
 ELSIF TG_TABLE_NAME IN ('recommendation_media','recommendation_display_overrides','book_recommendation_context','recommendation_book_covers','movie_recommendation_context','recommendation_taxonomy','recommendation_movie_media') THEN
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



CREATE TRIGGER recommendation_movie_media_content_revision_insert AFTER INSERT ON public.recommendation_movie_media REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.explorers_content_revision_insert();
CREATE TRIGGER recommendation_movie_media_content_revision_update AFTER UPDATE ON public.recommendation_movie_media REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.explorers_content_revision_update();
CREATE TRIGGER recommendation_movie_media_content_revision_delete AFTER DELETE ON public.recommendation_movie_media REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.explorers_content_revision_delete();

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
 DELETE FROM public.recommendation_movie_media WHERE account_id=target_account;
 DELETE FROM public.recommendations WHERE account_id=target_account;
 GET DIAGNOSTICS removed_recommendations=ROW_COUNT;
 DELETE FROM public.account_category_pin_state WHERE account_id=target_account;
 RETURN removed_collections+removed_recommendations;
END $$;
