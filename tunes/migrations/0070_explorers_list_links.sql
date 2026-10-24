-- LNK-01/02/03/08/09. Links between any two of one owner's lists, with an optional role.
-- Replaces 0049's Places-only parent links: every collection_location_links row is copied
-- here as host=location list, linked=child list, no role. 0049's table is KEPT: application
-- code stops using it in WP10, and dropping it is a separate owner-approved cleanup, so this
-- migration never deletes a link anyone made.
LOCK TABLE public.creator_accounts IN EXCLUSIVE MODE;
LOCK TABLE public.collections,public.collection_location_links IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE public.collection_list_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 account_id uuid NOT NULL,
 host_collection_id uuid NOT NULL,
 host_category text NOT NULL CHECK(host_category IN ('places','guides','movies','books','games','apps','products','people')),
 linked_collection_id uuid NOT NULL,
 linked_category text NOT NULL CHECK(linked_category IN ('places','guides','movies','books','games','apps','products','people')),
 role text CHECK(role IS NULL OR (length(role) BETWEEN 1 AND 80 AND role=btrim(role))),
 display_order integer NOT NULL CHECK(display_order BETWEEN 0 AND 99),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(host_collection_id<>linked_collection_id),
 UNIQUE(host_collection_id,display_order) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(host_collection_id,account_id,host_category) REFERENCES public.collections(id,account_id,category) ON DELETE CASCADE,
 FOREIGN KEY(linked_collection_id,account_id,linked_category) REFERENCES public.collections(id,account_id,category) ON DELETE CASCADE
);
CREATE UNIQUE INDEX collection_list_links_pair_idx ON public.collection_list_links(account_id,LEAST(host_collection_id,linked_collection_id),GREATEST(host_collection_id,linked_collection_id));
CREATE INDEX collection_list_links_host_idx ON public.collection_list_links(account_id,host_collection_id,display_order);
CREATE INDEX collection_list_links_linked_idx ON public.collection_list_links(account_id,linked_collection_id);

REVOKE ALL ON public.collection_list_links FROM PUBLIC,music_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.collection_list_links TO music_runtime;

DO $$ DECLARE crowded text; BEGIN
 SELECT string_agg(location_collection_id::text,',') INTO crowded FROM (
  SELECT location_collection_id FROM public.collection_location_links GROUP BY location_collection_id HAVING count(*)>100) c;
 IF crowded IS NOT NULL THEN RAISE EXCEPTION 'Location lists exceed 100 links: %',crowded USING ERRCODE='23514'; END IF;
END $$;

INSERT INTO public.collection_list_links(account_id,host_collection_id,host_category,linked_collection_id,linked_category,role,display_order,created_at)
SELECT l.account_id,l.location_collection_id,'places',l.child_collection_id,l.child_category,NULL,
 (row_number() OVER (PARTITION BY l.location_collection_id ORDER BY l.created_at,l.child_collection_id))-1,l.created_at
FROM public.collection_location_links l;

-- Re-declared verbatim from the 0054 bodies with collection_list_links added. Scopes come from
-- the row's own category columns, so a link removed by a list's cascade still bumps both scopes.
-- Declared after the backfill and before the triggers: the pure copy above bumps no revision.
CREATE OR REPLACE FUNCTION public.explorers_content_revision_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE scope record; scope_sql text;
BEGIN
 IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME NOT IN ('collections','recommendations','collection_items','collection_media','collection_location_links','collection_list_links','place_collection_details','guide_collection_details','guide_sections','guide_section_photos','recommendation_media','recommendation_display_overrides','book_recommendation_context','recommendation_book_covers','movie_recommendation_context','product_recommendation_context','place_recommendation_context','recommendation_place_photos','recommendation_taxonomy','recommendation_movie_media','recommendation_app_screenshots','category_recommendation_pins','account_category_pin_state') THEN
  RAISE EXCEPTION 'Invalid category revision trigger source' USING ERRCODE='42501';
 END IF;
 IF TG_TABLE_NAME='collection_location_links' THEN
  scope_sql := 'SELECT m.account_id,c.category FROM new_rows m JOIN public.collections c ON c.account_id=m.account_id AND c.id IN (m.child_collection_id,m.location_collection_id)';
 ELSIF TG_TABLE_NAME='collection_list_links' THEN scope_sql := 'SELECT account_id,host_category AS category FROM new_rows UNION SELECT account_id,linked_category FROM new_rows';
 ELSIF TG_TABLE_NAME='guide_section_photos' THEN
  scope_sql := 'SELECT m.account_id,c.category FROM new_rows m JOIN public.guide_sections s ON s.id=m.section_id AND s.account_id=m.account_id JOIN public.collections c ON c.id=s.collection_id AND c.account_id=m.account_id';
 ELSIF TG_TABLE_NAME IN ('collection_media','place_collection_details','guide_collection_details','guide_sections') THEN
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
  IF scope.category='places' THEN
   PERFORM public.explorers_places_category_mutation(scope.account_id);
  ELSE
  INSERT INTO public.account_category_content_state(account_id,category,revision)
   VALUES(scope.account_id,scope.category,1)
   ON CONFLICT(account_id,category) DO UPDATE SET revision=public.account_category_content_state.revision+1;
  END IF;
 END LOOP;
 RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.explorers_content_revision_update() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE scope record; scope_sql text;
BEGIN
 IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME NOT IN ('collections','recommendations','collection_items','collection_media','collection_location_links','collection_list_links','place_collection_details','guide_collection_details','guide_sections','guide_section_photos','recommendation_media','recommendation_display_overrides','book_recommendation_context','recommendation_book_covers','movie_recommendation_context','product_recommendation_context','place_recommendation_context','recommendation_place_photos','recommendation_taxonomy','recommendation_movie_media','recommendation_app_screenshots','category_recommendation_pins','account_category_pin_state') THEN
  RAISE EXCEPTION 'Invalid category revision trigger source' USING ERRCODE='42501';
 END IF;
 IF TG_TABLE_NAME='collection_location_links' THEN
  scope_sql := 'SELECT m.account_id,c.category FROM old_rows m JOIN public.collections c ON c.account_id=m.account_id AND c.id IN (m.child_collection_id,m.location_collection_id) UNION SELECT m.account_id,c.category FROM new_rows m JOIN public.collections c ON c.account_id=m.account_id AND c.id IN (m.child_collection_id,m.location_collection_id)';
 ELSIF TG_TABLE_NAME='collection_list_links' THEN scope_sql := 'SELECT account_id,host_category AS category FROM old_rows UNION SELECT account_id,linked_category FROM old_rows UNION SELECT account_id,host_category FROM new_rows UNION SELECT account_id,linked_category FROM new_rows';
 ELSIF TG_TABLE_NAME='guide_section_photos' THEN
  scope_sql := 'SELECT m.account_id,c.category FROM old_rows m JOIN public.guide_sections s ON s.id=m.section_id AND s.account_id=m.account_id JOIN public.collections c ON c.id=s.collection_id AND c.account_id=m.account_id UNION SELECT m.account_id,c.category FROM new_rows m JOIN public.guide_sections s ON s.id=m.section_id AND s.account_id=m.account_id JOIN public.collections c ON c.id=s.collection_id AND c.account_id=m.account_id';
 ELSIF TG_TABLE_NAME IN ('collection_media','place_collection_details','guide_collection_details','guide_sections') THEN
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
  IF scope.category='places' THEN
   PERFORM public.explorers_places_category_mutation(scope.account_id);
  ELSE
  INSERT INTO public.account_category_content_state(account_id,category,revision)
   VALUES(scope.account_id,scope.category,1)
   ON CONFLICT(account_id,category) DO UPDATE SET revision=public.account_category_content_state.revision+1;
  END IF;
 END LOOP;
 RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.explorers_content_revision_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE scope record; scope_sql text;
BEGIN
 IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME NOT IN ('collections','recommendations','collection_items','collection_media','collection_location_links','collection_list_links','place_collection_details','guide_collection_details','guide_sections','guide_section_photos','recommendation_media','recommendation_display_overrides','book_recommendation_context','recommendation_book_covers','movie_recommendation_context','product_recommendation_context','place_recommendation_context','recommendation_place_photos','recommendation_taxonomy','recommendation_movie_media','recommendation_app_screenshots','category_recommendation_pins','account_category_pin_state') THEN
  RAISE EXCEPTION 'Invalid category revision trigger source' USING ERRCODE='42501';
 END IF;
 IF TG_TABLE_NAME='collection_location_links' THEN
  scope_sql := 'SELECT m.account_id,c.category FROM old_rows m JOIN public.collections c ON c.account_id=m.account_id AND c.id IN (m.child_collection_id,m.location_collection_id)';
 ELSIF TG_TABLE_NAME='collection_list_links' THEN scope_sql := 'SELECT account_id,host_category AS category FROM old_rows UNION SELECT account_id,linked_category FROM old_rows';
 ELSIF TG_TABLE_NAME='guide_section_photos' THEN
  scope_sql := 'SELECT m.account_id,c.category FROM old_rows m JOIN public.guide_sections s ON s.id=m.section_id AND s.account_id=m.account_id JOIN public.collections c ON c.id=s.collection_id AND c.account_id=m.account_id';
 ELSIF TG_TABLE_NAME IN ('collection_media','place_collection_details','guide_collection_details','guide_sections') THEN
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
  IF scope.category='places' THEN
   PERFORM public.explorers_places_category_mutation(scope.account_id);
  ELSE
  INSERT INTO public.account_category_content_state(account_id,category,revision)
   VALUES(scope.account_id,scope.category,1)
   ON CONFLICT(account_id,category) DO UPDATE SET revision=public.account_category_content_state.revision+1;
  END IF;
 END LOOP;
 RETURN NULL;
END $$;

CREATE TRIGGER collection_list_links_content_revision_insert AFTER INSERT ON public.collection_list_links REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.explorers_content_revision_insert();
CREATE TRIGGER collection_list_links_content_revision_update AFTER UPDATE ON public.collection_list_links REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.explorers_content_revision_update();
CREATE TRIGGER collection_list_links_content_revision_delete AFTER DELETE ON public.collection_list_links REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.explorers_content_revision_delete();
