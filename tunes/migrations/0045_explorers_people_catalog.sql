-- People: a recommended person is data, not an identity. Ticket 4.5.
--
-- No FK to users or accounts, and no unique handle or name. Two people called "Alex Lee"
-- are two entities, and a handle equal to some account's handle confers nothing - the
-- target schema says so and the ticket owes an explicit proof of it.
--
-- Every column is nullable. The core entity title carries the name, so a person record
-- with nothing but a name is a legitimate state; that is the Books shape, not the Apps
-- one where app_url is NOT NULL.
--
-- suppressed_at is the one addition to the target schema's table, and it is an owner
-- decision recorded on 2026-10-07. A recommended person has no account, so they have no
-- route to ask for their own removal. When it is set, the public projections and the
-- search path omit the person and their recommendations stop publishing, while the
-- owner's own list keeps working. One nullable column now costs a great deal less than a
-- migration plus a backfill plus a sweep of every projection the first time it is needed,
-- and it is the difference between having an answer and not having one.
--
-- social_urls is a closed key set with http(s) values, enforced by the trigger below
-- because a CHECK cannot contain a subquery (0A000) - the lesson 0044 paid for.
LOCK TABLE public.creator_accounts IN EXCLUSIVE MODE;
LOCK TABLE public.entities,public.recommendations IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE public.person_entity_details (
 entity_id uuid PRIMARY KEY REFERENCES public.entities(id) ON DELETE CASCADE,
 username_handle text CHECK(username_handle IS NULL OR length(username_handle) BETWEEN 1 AND 200),
 headline text CHECK(headline IS NULL OR length(headline) BETWEEN 1 AND 500),
 location_text text CHECK(location_text IS NULL OR length(location_text) BETWEEN 1 AND 200),
 avatar_url text CHECK(avatar_url IS NULL OR (avatar_url ~ '^https?://' AND length(avatar_url) BETWEEN 8 AND 2048)),
 primary_platform text CHECK(primary_platform IS NULL OR primary_platform IN ('instagram','linkedin','twitter','github','youtube','website','other')),
 social_urls jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(social_urls)='object'),
 skills_tags text[] NOT NULL DEFAULT '{}' CHECK(array_length(skills_tags,1) IS NULL OR array_length(skills_tags,1)<=32),
 external_follower_count_text text CHECK(external_follower_count_text IS NULL OR length(external_follower_count_text) BETWEEN 1 AND 50),
 -- Set when the person has asked not to be listed. Never set by an owner's ordinary edit.
 suppressed_at timestamptz
);
CREATE INDEX person_entity_details_skills_idx ON public.person_entity_details USING gin(skills_tags);
CREATE INDEX person_entity_details_suppressed_idx ON public.person_entity_details(entity_id) WHERE suppressed_at IS NOT NULL;

CREATE FUNCTION public.guard_person_entity_details() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_TABLE_NAME='entities' THEN
  IF NEW.kind<>'person' AND EXISTS(SELECT 1 FROM public.person_entity_details WHERE entity_id=NEW.id) THEN RAISE EXCEPTION 'Person detail kind mismatch' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.entities WHERE id=NEW.entity_id AND kind='person') THEN RAISE EXCEPTION 'Person detail kind mismatch' USING ERRCODE='23514'; END IF;
 -- A closed key set with http(s) values. 'primary' is permitted alongside the platforms.
 IF EXISTS(SELECT 1 FROM jsonb_each(NEW.social_urls) entry
   WHERE entry.key NOT IN ('primary','instagram','linkedin','twitter','github','youtube','website','other')
     OR jsonb_typeof(entry.value)<>'string'
     OR entry.value #>> '{}' !~ '^https?://'
     OR length(entry.value #>> '{}') NOT BETWEEN 8 AND 2048)
 THEN RAISE EXCEPTION 'Person social links must be bounded http(s) addresses under known keys' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(NEW.skills_tags) tag WHERE length(tag) NOT BETWEEN 1 AND 100)
 THEN RAISE EXCEPTION 'Person skill tag out of bounds' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER person_entity_details_guard AFTER INSERT OR UPDATE ON public.person_entity_details DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_person_entity_details();
CREATE CONSTRAINT TRIGGER entities_person_details_kind_guard AFTER UPDATE ON public.entities DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_person_entity_details();

-- Insert-only, exactly as app_entity_details and product_entity_details are: the shared
-- catalog row is written once when the entity is resolved, and every per-owner change is
-- a display override. That is what makes one owner's edit unable to reach another owner's
-- recommendation of the same person, which this ticket owes as an explicit proof.
--
-- It also leaves suppressed_at with no application write path at all. Suppression is an
-- operator action taken through the migrator role, not something an owner's edit or a
-- compromised runtime can set or clear.
REVOKE ALL ON public.person_entity_details FROM PUBLIC,music_runtime;
GRANT SELECT,INSERT ON public.person_entity_details TO music_runtime;
REVOKE ALL ON FUNCTION public.guard_person_entity_details() FROM PUBLIC,music_runtime;

-- Carried forward unchanged from 0044; 0045 adds no recommendation-scoped table.

CREATE OR REPLACE FUNCTION public.explorers_content_revision_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE scope record; scope_sql text;
BEGIN
 IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME NOT IN ('collections','recommendations','collection_items','collection_media','recommendation_media','recommendation_display_overrides','book_recommendation_context','recommendation_book_covers','movie_recommendation_context','product_recommendation_context','recommendation_taxonomy','recommendation_movie_media','recommendation_app_screenshots','category_recommendation_pins','account_category_pin_state') THEN
  RAISE EXCEPTION 'Invalid category revision trigger source' USING ERRCODE='42501';
 END IF;
 IF TG_TABLE_NAME='collection_media' THEN
  scope_sql := 'SELECT m.account_id,c.category FROM new_rows m JOIN public.collections c ON c.id=m.collection_id AND c.account_id=m.account_id';
 ELSIF TG_TABLE_NAME IN ('recommendation_media','recommendation_display_overrides','book_recommendation_context','recommendation_book_covers','movie_recommendation_context','product_recommendation_context','recommendation_taxonomy','recommendation_movie_media','recommendation_app_screenshots') THEN
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
 IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME NOT IN ('collections','recommendations','collection_items','collection_media','recommendation_media','recommendation_display_overrides','book_recommendation_context','recommendation_book_covers','movie_recommendation_context','product_recommendation_context','recommendation_taxonomy','recommendation_movie_media','recommendation_app_screenshots','category_recommendation_pins','account_category_pin_state') THEN
  RAISE EXCEPTION 'Invalid category revision trigger source' USING ERRCODE='42501';
 END IF;
 IF TG_TABLE_NAME='collection_media' THEN
  scope_sql := 'SELECT m.account_id,c.category FROM old_rows m JOIN public.collections c ON c.id=m.collection_id AND c.account_id=m.account_id UNION SELECT m.account_id,c.category FROM new_rows m JOIN public.collections c ON c.id=m.collection_id AND c.account_id=m.account_id';
 ELSIF TG_TABLE_NAME IN ('recommendation_media','recommendation_display_overrides','book_recommendation_context','recommendation_book_covers','movie_recommendation_context','product_recommendation_context','recommendation_taxonomy','recommendation_movie_media','recommendation_app_screenshots') THEN
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
 IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME NOT IN ('collections','recommendations','collection_items','collection_media','recommendation_media','recommendation_display_overrides','book_recommendation_context','recommendation_book_covers','movie_recommendation_context','product_recommendation_context','recommendation_taxonomy','recommendation_movie_media','recommendation_app_screenshots','category_recommendation_pins','account_category_pin_state') THEN
  RAISE EXCEPTION 'Invalid category revision trigger source' USING ERRCODE='42501';
 END IF;
 IF TG_TABLE_NAME='collection_media' THEN
  scope_sql := 'SELECT m.account_id,c.category FROM old_rows m JOIN public.collections c ON c.id=m.collection_id AND c.account_id=m.account_id';
 ELSIF TG_TABLE_NAME IN ('recommendation_media','recommendation_display_overrides','book_recommendation_context','recommendation_book_covers','movie_recommendation_context','product_recommendation_context','recommendation_taxonomy','recommendation_movie_media','recommendation_app_screenshots') THEN
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
