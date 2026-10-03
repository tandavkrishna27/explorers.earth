-- Books facts remain shared; context belongs only to its recommendation account.
LOCK TABLE public.creator_accounts IN EXCLUSIVE MODE;
LOCK TABLE public.entities,public.recommendations IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE public.book_entity_details (
 entity_id uuid PRIMARY KEY REFERENCES public.entities(id) ON DELETE CASCADE,
 subtitle text,authors text[] NOT NULL DEFAULT '{}',publisher text,published_date_text text,year_text text,description text,
 cover_url text,cover_large_url text,subjects text[] NOT NULL DEFAULT '{}',page_count integer CHECK(page_count>=0),
 isbn_13 text CHECK(isbn_13 ~ '^[0-9]{13}$'),isbn_10 text CHECK(isbn_10 ~ '^[0-9]{9}[0-9X]$'),
 provider_rating numeric(3,2) CHECK(provider_rating BETWEEN 0 AND 5),ratings_count bigint CHECK(ratings_count>=0),language_tag text,preview_url text
);
CREATE INDEX book_entity_details_subjects_idx ON public.book_entity_details USING gin(subjects);
CREATE TABLE public.book_recommendation_context (
 recommendation_id uuid PRIMARY KEY,account_id uuid NOT NULL,
 buy_links jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(buy_links)='array' AND jsonb_array_length(buy_links)<=20),
 FOREIGN KEY(recommendation_id,account_id) REFERENCES public.recommendations(id,account_id) ON DELETE CASCADE
);
CREATE INDEX book_recommendation_context_account_idx ON public.book_recommendation_context(account_id,recommendation_id);
CREATE FUNCTION public.guard_book_entity_details() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_TABLE_NAME='entities' THEN
  IF NEW.kind<>'book' AND EXISTS(SELECT 1 FROM public.book_entity_details WHERE entity_id=NEW.id) THEN RAISE EXCEPTION 'Book detail kind mismatch' USING ERRCODE='23514'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM public.entities WHERE id=NEW.entity_id AND kind='book') THEN RAISE EXCEPTION 'Book detail kind mismatch' USING ERRCODE='23514'; END IF;
 END IF;RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER book_entity_details_kind_guard AFTER INSERT OR UPDATE ON public.book_entity_details DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_book_entity_details();
CREATE CONSTRAINT TRIGGER entities_book_details_kind_guard AFTER UPDATE ON public.entities DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_book_entity_details();
CREATE FUNCTION public.guard_book_recommendation_context() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_TABLE_NAME='recommendations' THEN
  IF NEW.category<>'books' AND EXISTS(SELECT 1 FROM public.book_recommendation_context WHERE recommendation_id=NEW.id) THEN RAISE EXCEPTION 'Book context category mismatch' USING ERRCODE='23514'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM public.recommendations WHERE id=NEW.recommendation_id AND account_id=NEW.account_id AND category='books') THEN RAISE EXCEPTION 'Book context category mismatch' USING ERRCODE='23514'; END IF;
 END IF;RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER book_recommendation_context_category_guard AFTER INSERT OR UPDATE ON public.book_recommendation_context DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_book_recommendation_context();
CREATE CONSTRAINT TRIGGER recommendations_book_context_category_guard AFTER UPDATE ON public.recommendations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_book_recommendation_context();
REVOKE ALL ON public.book_entity_details,public.book_recommendation_context FROM PUBLIC,music_runtime;
GRANT SELECT,INSERT ON public.book_entity_details TO music_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.book_recommendation_context TO music_runtime;
REVOKE ALL ON FUNCTION public.guard_book_entity_details(),public.guard_book_recommendation_context() FROM PUBLIC,music_runtime;
CREATE OR REPLACE FUNCTION public.explorers_content_revision_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE scope record; scope_sql text;
BEGIN
 IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME NOT IN ('collections','recommendations','collection_items','collection_media','recommendation_media','recommendation_display_overrides','book_recommendation_context','category_recommendation_pins','account_category_pin_state') THEN
  RAISE EXCEPTION 'Invalid category revision trigger source' USING ERRCODE='42501';
 END IF;
 IF TG_TABLE_NAME='collection_media' THEN
  scope_sql := 'SELECT m.account_id,c.category FROM new_rows m JOIN public.collections c ON c.id=m.collection_id AND c.account_id=m.account_id';
 ELSIF TG_TABLE_NAME IN ('recommendation_media','recommendation_display_overrides','book_recommendation_context') THEN
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
 IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME NOT IN ('collections','recommendations','collection_items','collection_media','recommendation_media','recommendation_display_overrides','book_recommendation_context','category_recommendation_pins','account_category_pin_state') THEN
  RAISE EXCEPTION 'Invalid category revision trigger source' USING ERRCODE='42501';
 END IF;
 IF TG_TABLE_NAME='collection_media' THEN
  scope_sql := 'SELECT m.account_id,c.category FROM old_rows m JOIN public.collections c ON c.id=m.collection_id AND c.account_id=m.account_id UNION SELECT m.account_id,c.category FROM new_rows m JOIN public.collections c ON c.id=m.collection_id AND c.account_id=m.account_id';
 ELSIF TG_TABLE_NAME IN ('recommendation_media','recommendation_display_overrides','book_recommendation_context') THEN
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
 IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME NOT IN ('collections','recommendations','collection_items','collection_media','recommendation_media','recommendation_display_overrides','book_recommendation_context','category_recommendation_pins','account_category_pin_state') THEN
  RAISE EXCEPTION 'Invalid category revision trigger source' USING ERRCODE='42501';
 END IF;
 IF TG_TABLE_NAME='collection_media' THEN
  scope_sql := 'SELECT m.account_id,c.category FROM old_rows m JOIN public.collections c ON c.id=m.collection_id AND c.account_id=m.account_id';
 ELSIF TG_TABLE_NAME IN ('recommendation_media','recommendation_display_overrides','book_recommendation_context') THEN
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



CREATE TRIGGER book_recommendation_context_content_revision_insert AFTER INSERT ON public.book_recommendation_context REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.explorers_content_revision_insert();
CREATE TRIGGER book_recommendation_context_content_revision_update AFTER UPDATE ON public.book_recommendation_context REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.explorers_content_revision_update();
CREATE TRIGGER book_recommendation_context_content_revision_delete AFTER DELETE ON public.book_recommendation_context REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.explorers_content_revision_delete();
