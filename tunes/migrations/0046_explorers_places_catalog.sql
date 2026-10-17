-- Places: provider facts on the shared entity, the creator's recommendation context per
-- recommendation, and contact disclosure off by default. Ticket 5.1.
--
-- The split is a privacy boundary, not just normalisation. public_phone on the entity is
-- an approved public fact from the provider. A creator's own contact_name and
-- contact_number live in their recommendation context, so one creator's details can
-- never surface through another's recommendation of the same place, and
-- contact_visibility defaults to 'private' - disclosure is a choice the creator makes,
-- not a default they have to discover and turn off.
--
-- Coordinates: numeric(10,7), bounded by CHECKs, with a paired-null invariant. Zero is a
-- real coordinate and absent stays null; a half-known coordinate is not a location, and
-- (0,0) is not a stand-in for "unknown". Ticket 5.1 owes that assertion explicitly.
--
-- recommendation_type 'person' is preserved inside a Places list, which is how the
-- existing form works. It does not move the item into the People category and it infers
-- no login identity; the person-only columns are constrained to that type.
--
-- No PostGIS. The launch schema defines no distance query, so the extension would be
-- carried without a caller.
LOCK TABLE public.creator_accounts IN EXCLUSIVE MODE;
LOCK TABLE public.entities,public.recommendations IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE public.place_entity_details (
 entity_id uuid PRIMARY KEY REFERENCES public.entities(id) ON DELETE CASCADE,
 formatted_address text CHECK(formatted_address IS NULL OR length(formatted_address) BETWEEN 1 AND 1000),
 address_components jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(address_components)='array'),
 latitude numeric(10,7) CHECK(latitude IS NULL OR latitude BETWEEN -90 AND 90),
 longitude numeric(10,7) CHECK(longitude IS NULL OR longitude BETWEEN -180 AND 180),
 provider_types text[] NOT NULL DEFAULT '{}' CHECK(array_length(provider_types,1) IS NULL OR array_length(provider_types,1)<=32),
 provider_rating numeric(3,2) CHECK(provider_rating IS NULL OR provider_rating BETWEEN 0 AND 5),
 ratings_count bigint CHECK(ratings_count IS NULL OR ratings_count>=0),
 public_phone text CHECK(public_phone IS NULL OR length(public_phone) BETWEEN 1 AND 50),
 public_phone_normalized text CHECK(public_phone_normalized IS NULL OR public_phone_normalized ~ '^[0-9]{3,20}$'),
 website_url text CHECK(website_url IS NULL OR (website_url ~ '^https?://' AND length(website_url) BETWEEN 8 AND 2048)),
 price_level smallint CHECK(price_level IS NULL OR price_level BETWEEN 0 AND 4),
 price_range jsonb CHECK(price_range IS NULL OR jsonb_typeof(price_range) IN ('object','string')),
 -- A coordinate pair is present or absent together. Zero is present.
 CHECK((latitude IS NULL)=(longitude IS NULL))
);
CREATE INDEX place_entity_details_phone_idx ON public.place_entity_details(public_phone_normalized) WHERE public_phone_normalized IS NOT NULL;
CREATE INDEX place_entity_details_types_idx ON public.place_entity_details USING gin(provider_types);

CREATE TABLE public.place_recommendation_context (
 recommendation_id uuid PRIMARY KEY,account_id uuid NOT NULL,
 category text NOT NULL DEFAULT 'places' CHECK(category='places'),
 recommendation_type text NOT NULL DEFAULT 'place' CHECK(recommendation_type IN ('place','person')),
 source_of_recommendation text NOT NULL DEFAULT 'self' CHECK(source_of_recommendation IN ('self','suggestion')),
 contact_name text CHECK(contact_name IS NULL OR length(contact_name) BETWEEN 1 AND 200),
 contact_number text CHECK(contact_number IS NULL OR length(contact_number) BETWEEN 1 AND 50),
 -- Private until the creator says otherwise.
 contact_visibility text NOT NULL DEFAULT 'private' CHECK(contact_visibility IN ('private','public')),
 place_social_url text CHECK(place_social_url IS NULL OR (place_social_url ~ '^https?://' AND length(place_social_url) BETWEEN 8 AND 2048)),
 place_website_url text CHECK(place_website_url IS NULL OR (place_website_url ~ '^https?://' AND length(place_website_url) BETWEEN 8 AND 2048)),
 creator_social_url text CHECK(creator_social_url IS NULL OR (creator_social_url ~ '^https?://' AND length(creator_social_url) BETWEEN 8 AND 2048)),
 legacy_place_note jsonb CHECK(legacy_place_note IS NULL OR jsonb_typeof(legacy_place_note) IN ('object','array')),
 person_profile_url text CHECK(person_profile_url IS NULL OR (person_profile_url ~ '^https?://' AND length(person_profile_url) BETWEEN 8 AND 2048)),
 person_address text CHECK(person_address IS NULL OR length(person_address) BETWEEN 1 AND 1000),
 -- The person-only columns belong to a person recommendation alone.
 CHECK(recommendation_type='person' OR (person_profile_url IS NULL AND person_address IS NULL)),
 UNIQUE(recommendation_id,account_id),
 FOREIGN KEY(recommendation_id,account_id,category) REFERENCES public.recommendations(id,account_id,category) ON DELETE CASCADE
);
CREATE INDEX place_recommendation_context_account_idx ON public.place_recommendation_context(account_id,recommendation_id);

CREATE FUNCTION public.guard_place_entity_details() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_TABLE_NAME='entities' THEN
  IF NEW.kind<>'place' AND EXISTS(SELECT 1 FROM public.place_entity_details WHERE entity_id=NEW.id) THEN RAISE EXCEPTION 'Place detail kind mismatch' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.entities WHERE id=NEW.entity_id AND kind='place') THEN RAISE EXCEPTION 'Place detail kind mismatch' USING ERRCODE='23514'; END IF;
 -- Address components are objects with a bounded type list, checked here because a CHECK
 -- cannot contain a subquery (0A000).
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.address_components) entry WHERE jsonb_typeof(entry.value)<>'object')
 THEN RAISE EXCEPTION 'Place address component must be an object' USING ERRCODE='23514'; END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(NEW.address_components))>32
 THEN RAISE EXCEPTION 'Place address components exceed 32 entries' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(NEW.provider_types) entry WHERE length(entry) NOT BETWEEN 1 AND 100)
 THEN RAISE EXCEPTION 'Place provider type out of bounds' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER place_entity_details_guard AFTER INSERT OR UPDATE ON public.place_entity_details DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_place_entity_details();
CREATE CONSTRAINT TRIGGER entities_place_details_kind_guard AFTER UPDATE ON public.entities DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_place_entity_details();

-- The deferred invariant the target schema requires: a 'place' recommendation points at a
-- place entity and a 'person' recommendation at a person entity, checked at the end of
-- the transaction so either side may be written first.
CREATE FUNCTION public.guard_place_context_kind() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE item record;
BEGIN
 IF TG_TABLE_NAME='recommendations' THEN
  SELECT * INTO item FROM public.place_recommendation_context WHERE recommendation_id=NEW.id;
  IF NOT FOUND THEN RETURN NULL; END IF;
 ELSE
  SELECT * INTO item FROM public.place_recommendation_context WHERE recommendation_id=NEW.recommendation_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.recommendations r JOIN public.entities e ON e.id=r.entity_id
   WHERE r.id=item.recommendation_id AND r.account_id=item.account_id AND r.category='places'
     AND e.kind=CASE WHEN item.recommendation_type='person' THEN 'person' ELSE 'place' END)
 THEN RAISE EXCEPTION 'Place recommendation type must match its entity kind' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER place_recommendation_context_kind_guard AFTER INSERT OR UPDATE ON public.place_recommendation_context DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_place_context_kind();
CREATE CONSTRAINT TRIGGER recommendations_place_context_kind_guard AFTER UPDATE ON public.recommendations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_place_context_kind();

-- place_entity_details is insert-only shared catalog, as every other category's entity
-- details are. The creator's own context is theirs to change.
REVOKE ALL ON public.place_entity_details,public.place_recommendation_context FROM PUBLIC,music_runtime;
GRANT SELECT,INSERT ON public.place_entity_details TO music_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.place_recommendation_context TO music_runtime;
REVOKE ALL ON FUNCTION public.guard_place_entity_details(),public.guard_place_context_kind() FROM PUBLIC,music_runtime;

CREATE TRIGGER place_recommendation_context_content_revision_insert AFTER INSERT ON public.place_recommendation_context REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.explorers_content_revision_insert();
CREATE TRIGGER place_recommendation_context_content_revision_update AFTER UPDATE ON public.place_recommendation_context REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.explorers_content_revision_update();
CREATE TRIGGER place_recommendation_context_content_revision_delete AFTER DELETE ON public.place_recommendation_context REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.explorers_content_revision_delete();

-- Re-declared from the 0045 bodies with place_recommendation_context added, generated
-- rather than retyped.

CREATE OR REPLACE FUNCTION public.explorers_content_revision_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE scope record; scope_sql text;
BEGIN
 IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME NOT IN ('collections','recommendations','collection_items','collection_media','recommendation_media','recommendation_display_overrides','book_recommendation_context','recommendation_book_covers','movie_recommendation_context','product_recommendation_context','place_recommendation_context','recommendation_taxonomy','recommendation_movie_media','recommendation_app_screenshots','category_recommendation_pins','account_category_pin_state') THEN
  RAISE EXCEPTION 'Invalid category revision trigger source' USING ERRCODE='42501';
 END IF;
 IF TG_TABLE_NAME='collection_media' THEN
  scope_sql := 'SELECT m.account_id,c.category FROM new_rows m JOIN public.collections c ON c.id=m.collection_id AND c.account_id=m.account_id';
 ELSIF TG_TABLE_NAME IN ('recommendation_media','recommendation_display_overrides','book_recommendation_context','recommendation_book_covers','movie_recommendation_context','product_recommendation_context','place_recommendation_context','recommendation_taxonomy','recommendation_movie_media','recommendation_app_screenshots') THEN
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
 IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME NOT IN ('collections','recommendations','collection_items','collection_media','recommendation_media','recommendation_display_overrides','book_recommendation_context','recommendation_book_covers','movie_recommendation_context','product_recommendation_context','place_recommendation_context','recommendation_taxonomy','recommendation_movie_media','recommendation_app_screenshots','category_recommendation_pins','account_category_pin_state') THEN
  RAISE EXCEPTION 'Invalid category revision trigger source' USING ERRCODE='42501';
 END IF;
 IF TG_TABLE_NAME='collection_media' THEN
  scope_sql := 'SELECT m.account_id,c.category FROM old_rows m JOIN public.collections c ON c.id=m.collection_id AND c.account_id=m.account_id UNION SELECT m.account_id,c.category FROM new_rows m JOIN public.collections c ON c.id=m.collection_id AND c.account_id=m.account_id';
 ELSIF TG_TABLE_NAME IN ('recommendation_media','recommendation_display_overrides','book_recommendation_context','recommendation_book_covers','movie_recommendation_context','product_recommendation_context','place_recommendation_context','recommendation_taxonomy','recommendation_movie_media','recommendation_app_screenshots') THEN
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
 IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME NOT IN ('collections','recommendations','collection_items','collection_media','recommendation_media','recommendation_display_overrides','book_recommendation_context','recommendation_book_covers','movie_recommendation_context','product_recommendation_context','place_recommendation_context','recommendation_taxonomy','recommendation_movie_media','recommendation_app_screenshots','category_recommendation_pins','account_category_pin_state') THEN
  RAISE EXCEPTION 'Invalid category revision trigger source' USING ERRCODE='42501';
 END IF;
 IF TG_TABLE_NAME='collection_media' THEN
  scope_sql := 'SELECT m.account_id,c.category FROM old_rows m JOIN public.collections c ON c.id=m.collection_id AND c.account_id=m.account_id';
 ELSIF TG_TABLE_NAME IN ('recommendation_media','recommendation_display_overrides','book_recommendation_context','recommendation_book_covers','movie_recommendation_context','product_recommendation_context','place_recommendation_context','recommendation_taxonomy','recommendation_movie_media','recommendation_app_screenshots') THEN
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
 DELETE FROM public.recommendation_movie_media WHERE account_id=target_account;
 DELETE FROM public.recommendations WHERE account_id=target_account;
 GET DIAGNOSTICS removed_recommendations=ROW_COUNT;
 DELETE FROM public.account_category_pin_state WHERE account_id=target_account;
 RETURN removed_collections+removed_recommendations;
END $$;
