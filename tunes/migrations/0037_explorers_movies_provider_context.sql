-- Canonical Movies facts and account-owned editorial associations. Historical SQL is unchanged.
LOCK TABLE public.creator_accounts IN EXCLUSIVE MODE;
LOCK TABLE public.entities,public.recommendations IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE public.movie_entity_details (
 entity_id uuid PRIMARY KEY REFERENCES public.entities(id) ON DELETE CASCADE,
 media_type text NOT NULL CHECK(media_type IN('movie','tv')),original_title text,year_text text,poster_url text,backdrop_url text,
 genres text[] NOT NULL DEFAULT '{}' CHECK(cardinality(genres)<=32),director text,runtime_minutes integer CHECK(runtime_minutes>=0),
 provider_rating numeric(4,2) CHECK(provider_rating BETWEEN 0 AND 10),overview text,season_count integer CHECK(season_count>=0),
 watch_providers jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(watch_providers)='object'),cast_details jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(cast_details)='array' AND jsonb_array_length(cast_details)<=200),
 CHECK(media_type='tv' OR season_count IS NULL)
);
CREATE INDEX movie_entity_details_genres_idx ON public.movie_entity_details USING gin(genres);
CREATE TABLE public.movie_entity_provider_genres (
 entity_id uuid NOT NULL REFERENCES public.movie_entity_details(entity_id) ON DELETE CASCADE,
 position integer NOT NULL CHECK(position BETWEEN 0 AND 31),provider_genre_id bigint NOT NULL CHECK(provider_genre_id BETWEEN 1 AND 9007199254740991),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 200),PRIMARY KEY(entity_id,position),UNIQUE(entity_id,provider_genre_id)
);
CREATE TABLE public.taxonomy_terms (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),category text NOT NULL CHECK(category IN('places','books','movies','games','apps','products','people','guides')),
 parent_id uuid REFERENCES public.taxonomy_terms(id) ON DELETE RESTRICT,slug text NOT NULL CHECK(length(slug) BETWEEN 1 AND 100),
 position integer NOT NULL DEFAULT 0 CHECK(position>=0),active boolean NOT NULL DEFAULT true,UNIQUE(category,slug),UNIQUE(id,category),CHECK(parent_id IS NULL OR parent_id<>id)
);
CREATE INDEX taxonomy_terms_parent_position_idx ON public.taxonomy_terms(parent_id,position,id);
CREATE TABLE public.taxonomy_term_translations (
 term_id uuid NOT NULL REFERENCES public.taxonomy_terms(id) ON DELETE CASCADE,locale text NOT NULL CHECK(locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
 label text NOT NULL CHECK(length(label) BETWEEN 1 AND 200),PRIMARY KEY(term_id,locale)
);
CREATE INDEX taxonomy_term_translations_locale_idx ON public.taxonomy_term_translations(locale,term_id);
CREATE TABLE public.movie_provider_genre_terms (
 external_kind text NOT NULL CHECK(external_kind IN('movie','tv')),provider_genre_id bigint NOT NULL CHECK(provider_genre_id BETWEEN 1 AND 9007199254740991),
 term_id uuid NOT NULL,category text NOT NULL DEFAULT 'movies' CHECK(category='movies'),PRIMARY KEY(external_kind,provider_genre_id),
 FOREIGN KEY(term_id,category) REFERENCES public.taxonomy_terms(id,category) ON DELETE RESTRICT
);
CREATE TABLE public.recommendation_taxonomy (
 recommendation_id uuid NOT NULL,account_id uuid NOT NULL,category text NOT NULL CHECK(category IN('places','books','movies','games','apps','products','people','guides')),
 term_id uuid NOT NULL,position integer NOT NULL DEFAULT 0 CHECK(position BETWEEN 0 AND 31),PRIMARY KEY(recommendation_id,term_id),UNIQUE(recommendation_id,position) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(recommendation_id,account_id,category) REFERENCES public.recommendations(id,account_id,category) ON DELETE CASCADE,
 FOREIGN KEY(term_id,category) REFERENCES public.taxonomy_terms(id,category) ON DELETE RESTRICT
);
CREATE INDEX recommendation_taxonomy_term_idx ON public.recommendation_taxonomy(term_id,recommendation_id);
CREATE INDEX recommendation_taxonomy_account_idx ON public.recommendation_taxonomy(account_id,recommendation_id);
CREATE TABLE public.movie_recommendation_context (
 recommendation_id uuid PRIMARY KEY,account_id uuid NOT NULL,category text NOT NULL DEFAULT 'movies' CHECK(category='movies'),
 region text NOT NULL DEFAULT 'US' CHECK(region ~ '^[A-Z]{2}$'),selected_provider_ids bigint[],
 CHECK(selected_provider_ids IS NULL OR cardinality(selected_provider_ids)<=8),
 FOREIGN KEY(recommendation_id,account_id,category) REFERENCES public.recommendations(id,account_id,category) ON DELETE CASCADE
);
CREATE INDEX movie_recommendation_context_account_idx ON public.movie_recommendation_context(account_id,recommendation_id);
-- TMDB official documented kind/ID lists; English labels are reviewed translations, not live response receipts.
-- Documentation example hashes and review provenance are recorded in movieGenreSeeds.ts and the mapping review.
INSERT INTO public.taxonomy_terms(category,slug,position,parent_id,active)
SELECT 'movies',seed.slug,seed.position,NULL,true FROM (VALUES
('action',0),
('adventure',1),
('animation',2),
('comedy',3),
('crime',4),
('documentary',5),
('drama',6),
('family',7),
('fantasy',8),
('history',9),
('horror',10),
('music',11),
('mystery',12),
('romance',13),
('science-fiction',14),
('tv-movie',15),
('thriller',16),
('war',17),
('western',18),
('action-adventure',19),
('kids',20),
('news',21),
('reality',22),
('sci-fi-fantasy',23),
('soap',24),
('talk',25),
('war-politics',26)
) AS seed(slug,position);
INSERT INTO public.taxonomy_term_translations(term_id,locale,label)
SELECT t.id,'en',seed.label FROM (VALUES
('action','Action'),
('adventure','Adventure'),
('animation','Animation'),
('comedy','Comedy'),
('crime','Crime'),
('documentary','Documentary'),
('drama','Drama'),
('family','Family'),
('fantasy','Fantasy'),
('history','History'),
('horror','Horror'),
('music','Music'),
('mystery','Mystery'),
('romance','Romance'),
('science-fiction','Science Fiction'),
('tv-movie','TV Movie'),
('thriller','Thriller'),
('war','War'),
('western','Western'),
('action-adventure','Action & Adventure'),
('kids','Kids'),
('news','News'),
('reality','Reality'),
('sci-fi-fantasy','Sci-Fi & Fantasy'),
('soap','Soap'),
('talk','Talk'),
('war-politics','War & Politics')
) AS seed(slug,label) JOIN public.taxonomy_terms t ON t.category='movies' AND t.slug=seed.slug;
INSERT INTO public.movie_provider_genre_terms(external_kind,provider_genre_id,term_id,category)
SELECT seed.kind,seed.id,t.id,'movies' FROM (VALUES
('movie',28,'action'),
('movie',12,'adventure'),
('movie',16,'animation'),
('movie',35,'comedy'),
('movie',80,'crime'),
('movie',99,'documentary'),
('movie',18,'drama'),
('movie',10751,'family'),
('movie',14,'fantasy'),
('movie',36,'history'),
('movie',27,'horror'),
('movie',10402,'music'),
('movie',9648,'mystery'),
('movie',10749,'romance'),
('movie',878,'science-fiction'),
('movie',10770,'tv-movie'),
('movie',53,'thriller'),
('movie',10752,'war'),
('movie',37,'western'),
('tv',10759,'action-adventure'),
('tv',16,'animation'),
('tv',35,'comedy'),
('tv',80,'crime'),
('tv',99,'documentary'),
('tv',18,'drama'),
('tv',10751,'family'),
('tv',10762,'kids'),
('tv',9648,'mystery'),
('tv',10763,'news'),
('tv',10764,'reality'),
('tv',10765,'sci-fi-fantasy'),
('tv',10766,'soap'),
('tv',10767,'talk'),
('tv',10768,'war-politics'),
('tv',37,'western')
) AS seed(kind,id,slug) JOIN public.taxonomy_terms t ON t.category='movies' AND t.slug=seed.slug;
CREATE FUNCTION public.guard_movie_details() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE target uuid; kind_value text; details record; identity_kind text; region_row record; mode_value text; member jsonb;
BEGIN
 IF TG_TABLE_NAME='entities' THEN target:=NEW.id; ELSE target:=CASE WHEN TG_OP='DELETE' THEN OLD.entity_id ELSE NEW.entity_id END; END IF;
 IF TG_TABLE_NAME='entity_identifiers' AND TG_OP='UPDATE' THEN
 IF NEW.entity_id IS DISTINCT FROM OLD.entity_id AND EXISTS(SELECT 1 FROM public.movie_entity_details WHERE entity_id=OLD.entity_id AND cardinality(genres)>0) AND OLD.provider='tmdb' THEN RAISE EXCEPTION 'Movie provider identity parent immutable' USING ERRCODE='23514'; END IF;
 END IF;
 SELECT kind INTO kind_value FROM public.entities WHERE id=target FOR UPDATE;
 SELECT * INTO details FROM public.movie_entity_details WHERE entity_id=target;
 IF details.entity_id IS NULL THEN RETURN NEW; END IF;
 IF kind_value<>'movie' THEN RAISE EXCEPTION 'Movie kind mismatch' USING ERRCODE='23514'; END IF;
 SELECT external_kind INTO identity_kind FROM public.entity_identifiers WHERE entity_id=target AND provider='tmdb';
 IF identity_kind IS NOT NULL AND identity_kind<>details.media_type THEN RAISE EXCEPTION 'Movie provider kind mismatch' USING ERRCODE='23514'; END IF;
 IF cardinality(details.genres)>0 AND NOT EXISTS(SELECT 1 FROM public.entities e JOIN public.entity_identifiers i ON i.entity_id=e.id WHERE e.id=target AND e.origin='provider' AND i.provider='tmdb' AND i.external_kind=details.media_type AND CASE WHEN i.external_id ~ '^[1-9][0-9]{0,15}$' THEN i.external_id::numeric<=9007199254740991 ELSE false END AND i.source_url='https://api.themoviedb.org/3/'||i.external_kind||'/'||i.external_id AND i.fetched_at IS NOT NULL) THEN RAISE EXCEPTION 'Movie genres require TMDB provenance' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(details.watch_providers) r WHERE r.key !~ '^[A-Z]{2}$' OR jsonb_typeof(r.value)<>'object') OR (SELECT count(*) FROM jsonb_each(details.watch_providers))>32 THEN RAISE EXCEPTION 'Invalid watch regions' USING ERRCODE='23514'; END IF;
 IF octet_length(to_jsonb(details)::text)>1048576 OR length(details.original_title)>1000 OR length(details.year_text)>100 OR length(details.director)>1000 OR length(details.overview)>100000 THEN RAISE EXCEPTION 'Movie facts exceed bounds' USING ERRCODE='23514';END IF;
 FOR region_row IN SELECT * FROM jsonb_each(details.watch_providers) LOOP
  IF NOT region_row.value ?& ARRAY['link','flatrate','rent','buy'] OR EXISTS(SELECT 1 FROM jsonb_object_keys(region_row.value) key WHERE key NOT IN('link','flatrate','rent','buy')) THEN RAISE EXCEPTION 'Invalid watch object' USING ERRCODE='23514';END IF;
  IF jsonb_typeof(region_row.value->'link') NOT IN('null','string') OR length(region_row.value->>'link')>2048 OR (region_row.value->>'link' IS NOT NULL AND region_row.value->>'link' !~ '^https://[^/@:?#]+(/|$)') THEN RAISE EXCEPTION 'Invalid watch link' USING ERRCODE='23514';END IF;
  FOREACH mode_value IN ARRAY ARRAY['flatrate','rent','buy'] LOOP
   IF jsonb_typeof(region_row.value->mode_value)<>'array' THEN RAISE EXCEPTION 'Invalid watch mode' USING ERRCODE='23514';END IF;
   IF jsonb_array_length(region_row.value->mode_value)>64 THEN RAISE EXCEPTION 'Too many watch offers' USING ERRCODE='23514';END IF;
   FOR member IN SELECT * FROM jsonb_array_elements(region_row.value->mode_value) LOOP
    IF jsonb_typeof(member)<>'object' OR NOT member ?& ARRAY['providerId','name','logoUrl','priority'] THEN RAISE EXCEPTION 'Invalid watch offer' USING ERRCODE='23514';END IF;
    IF EXISTS(SELECT 1 FROM jsonb_object_keys(member) key WHERE key NOT IN('providerId','name','logoUrl','priority')) OR jsonb_typeof(member->'providerId')<>'number' OR coalesce(member->>'providerId','') !~ '^[1-9][0-9]*$' OR (member->>'providerId')::numeric>9007199254740991 OR jsonb_typeof(member->'priority')<>'number' OR coalesce(member->>'priority','') !~ '^(0|[1-9][0-9]*)$' OR (member->>'priority')::numeric>9007199254740991 OR jsonb_typeof(member->'name')<>'string' OR length(member->>'name') NOT BETWEEN 1 AND 200 OR jsonb_typeof(member->'logoUrl') NOT IN('null','string') OR length(member->>'logoUrl')>2048 OR (member->>'logoUrl' IS NOT NULL AND member->>'logoUrl' !~ '^https://image[.]tmdb[.]org/') THEN RAISE EXCEPTION 'Invalid watch offer fields' USING ERRCODE='23514';END IF;
   END LOOP;
  END LOOP;
 END LOOP;
 FOR member IN SELECT * FROM jsonb_array_elements(details.cast_details) LOOP
  IF jsonb_typeof(member)<>'object' OR NOT member ?& ARRAY['personId','creditId','name','character','profileUrl','order'] THEN RAISE EXCEPTION 'Invalid cast object' USING ERRCODE='23514';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(member) key WHERE key NOT IN('personId','creditId','name','character','profileUrl','order')) OR jsonb_typeof(member->'personId')<>'number' OR coalesce(member->>'personId','') !~ '^[1-9][0-9]*$' OR (member->>'personId')::numeric>9007199254740991 OR jsonb_typeof(member->'order')<>'number' OR coalesce(member->>'order','') !~ '^(0|[1-9][0-9]*)$' OR (member->>'order')::numeric>9007199254740991 OR jsonb_typeof(member->'creditId')<>'string' OR length(member->>'creditId') NOT BETWEEN 1 AND 200 OR jsonb_typeof(member->'name')<>'string' OR length(member->>'name') NOT BETWEEN 1 AND 1000 OR jsonb_typeof(member->'character')<>'string' OR length(member->>'character')>1000 OR jsonb_typeof(member->'profileUrl') NOT IN('null','string') OR length(member->>'profileUrl')>2048 OR (member->>'profileUrl' IS NOT NULL AND member->>'profileUrl' !~ '^https://image[.]tmdb[.]org/') THEN RAISE EXCEPTION 'Invalid cast fields' USING ERRCODE='23514';END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER movie_details_constraint AFTER INSERT OR UPDATE ON public.movie_entity_details DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_movie_details();
CREATE CONSTRAINT TRIGGER movie_details_entity_constraint AFTER UPDATE ON public.entities DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_movie_details();
CREATE CONSTRAINT TRIGGER movie_details_identity_constraint AFTER INSERT OR UPDATE OR DELETE ON public.entity_identifiers DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_movie_details();
CREATE FUNCTION public.lock_movie_genre_parent() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN IF TG_OP='UPDATE' AND NEW.entity_id IS DISTINCT FROM OLD.entity_id THEN RAISE EXCEPTION 'Movie genre parent immutable' USING ERRCODE='23514';END IF; PERFORM 1 FROM public.entities WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.entity_id ELSE NEW.entity_id END FOR UPDATE; RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END $$;
CREATE TRIGGER movie_genre_parent_lock BEFORE INSERT OR UPDATE OR DELETE ON public.movie_entity_provider_genres FOR EACH ROW EXECUTE FUNCTION public.lock_movie_genre_parent();
CREATE FUNCTION public.guard_movie_genres() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE target uuid; names text[]; expected text[]; count_value integer; maximum integer; details record;
BEGIN
 target:=CASE WHEN TG_OP='DELETE' THEN OLD.entity_id ELSE NEW.entity_id END;
 SELECT * INTO details FROM public.movie_entity_details WHERE entity_id=target; IF NOT FOUND THEN RETURN NULL; END IF; expected:=details.genres;
 IF cardinality(details.genres)>0 AND NOT EXISTS(SELECT 1 FROM public.entities e JOIN public.entity_identifiers i ON i.entity_id=e.id WHERE e.id=target AND e.origin='provider' AND i.provider='tmdb' AND i.external_kind=details.media_type AND CASE WHEN i.external_id ~ '^[1-9][0-9]{0,15}$' THEN i.external_id::numeric<=9007199254740991 ELSE false END AND i.source_url='https://api.themoviedb.org/3/'||i.external_kind||'/'||i.external_id AND i.fetched_at IS NOT NULL) THEN RAISE EXCEPTION 'Movie genres require TMDB provenance' USING ERRCODE='23514'; END IF;

 SELECT array_agg(name ORDER BY position),count(*),max(position) INTO names,count_value,maximum FROM public.movie_entity_provider_genres WHERE entity_id=target;
 IF count_value>32 OR coalesce(maximum,-1)<>count_value-1 OR coalesce(names,'{}')<>expected THEN RAISE EXCEPTION 'Movie genre companion mismatch' USING ERRCODE='23514'; END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER movie_genres_constraint AFTER INSERT OR UPDATE OR DELETE ON public.movie_entity_provider_genres DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_movie_genres();
CREATE CONSTRAINT TRIGGER movie_genres_details_constraint AFTER INSERT OR UPDATE ON public.movie_entity_details DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_movie_genres();
CREATE FUNCTION public.guard_taxonomy_tree() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.taxonomy_terms child JOIN public.taxonomy_terms parent ON parent.id=child.parent_id WHERE parent.id=NEW.id AND child.category<>parent.category) THEN RAISE EXCEPTION 'Taxonomy child category mismatch' USING ERRCODE='23514';END IF;
 IF NEW.parent_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.taxonomy_terms WHERE id=NEW.parent_id AND category=NEW.category) THEN RAISE EXCEPTION 'Taxonomy parent category mismatch' USING ERRCODE='23514';END IF;
 IF EXISTS(WITH RECURSIVE parents(id,path,cycle) AS (SELECT NEW.parent_id,ARRAY[NEW.id],false UNION ALL SELECT t.parent_id,p.path||p.id,p.id=ANY(p.path) FROM parents p JOIN public.taxonomy_terms t ON t.id=p.id WHERE p.id IS NOT NULL AND NOT p.cycle) SELECT 1 FROM parents WHERE cycle OR id=NEW.id) THEN RAISE EXCEPTION 'Taxonomy cycle' USING ERRCODE='23514';END IF; RETURN NEW;
END $$;
CREATE FUNCTION public.lock_taxonomy_tree() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN LOCK TABLE public.taxonomy_terms IN SHARE ROW EXCLUSIVE MODE; RETURN NEW; END $$;
CREATE TRIGGER taxonomy_tree_lock BEFORE INSERT OR UPDATE ON public.taxonomy_terms FOR EACH ROW EXECUTE FUNCTION public.lock_taxonomy_tree();
CREATE CONSTRAINT TRIGGER taxonomy_tree_constraint AFTER INSERT OR UPDATE ON public.taxonomy_terms DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_taxonomy_tree();
CREATE FUNCTION public.lock_recommendation_taxonomy_parent() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.recommendation_id,NEW.account_id,NEW.category) IS DISTINCT FROM (OLD.recommendation_id,OLD.account_id,OLD.category) THEN RAISE EXCEPTION 'Taxonomy association parent is immutable' USING ERRCODE='23514';END IF;
 IF TG_OP IN('UPDATE','DELETE') THEN PERFORM id FROM public.recommendations WHERE id=OLD.recommendation_id FOR UPDATE;END IF;
 IF TG_OP IN('INSERT','UPDATE') THEN
  PERFORM id FROM public.recommendations WHERE id=NEW.recommendation_id FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM public.taxonomy_terms WHERE id=NEW.term_id AND category=NEW.category AND active) THEN RAISE EXCEPTION 'Inactive taxonomy assignment' USING ERRCODE='23514';END IF;
  RETURN NEW;
 END IF; RETURN OLD;
END $$;
CREATE FUNCTION public.guard_recommendation_taxonomy() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE target uuid; count_value integer; maximum integer;
BEGIN
 target:=CASE WHEN TG_OP='DELETE' THEN OLD.recommendation_id ELSE NEW.recommendation_id END;
 SELECT count(*),max(position) INTO count_value,maximum FROM public.recommendation_taxonomy WHERE recommendation_id=target;
 IF count_value>32 OR (count_value>0 AND maximum<>count_value-1) THEN RAISE EXCEPTION 'Invalid taxonomy ordering' USING ERRCODE='23514';END IF;RETURN NULL;
END $$;
CREATE TRIGGER recommendation_taxonomy_parent_lock BEFORE INSERT OR UPDATE OR DELETE ON public.recommendation_taxonomy FOR EACH ROW EXECUTE FUNCTION public.lock_recommendation_taxonomy_parent();
CREATE CONSTRAINT TRIGGER recommendation_taxonomy_constraint AFTER INSERT OR UPDATE OR DELETE ON public.recommendation_taxonomy DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_recommendation_taxonomy();
REVOKE ALL ON FUNCTION public.lock_recommendation_taxonomy_parent(),public.guard_recommendation_taxonomy() FROM PUBLIC,music_runtime;
CREATE FUNCTION public.validate_movie_context(target_entity uuid,region_value text,selected bigint[]) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE facts jsonb;
BEGIN
 IF selected IS NULL OR cardinality(selected)=0 THEN RETURN;END IF;
 IF cardinality(selected)>8 OR EXISTS(SELECT 1 FROM unnest(selected) id WHERE id IS NULL OR id<1 OR id>9007199254740991) OR (SELECT count(DISTINCT id) FROM unnest(selected) id)<>cardinality(selected) THEN RAISE EXCEPTION 'Invalid Movie selection' USING ERRCODE='23514';END IF;
 SELECT watch_providers->region_value INTO facts FROM public.movie_entity_details WHERE entity_id=target_entity;
 IF facts IS NULL OR EXISTS(SELECT 1 FROM unnest(selected) id WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(facts->'flatrate','[]')||coalesce(facts->'rent','[]')||coalesce(facts->'buy','[]')) offer WHERE (offer->>'providerId')::bigint=id)) THEN RAISE EXCEPTION 'MOVIE_CONTEXT_INCOMPATIBLE' USING ERRCODE='23514';END IF;
END $$;
CREATE FUNCTION public.guard_movie_context() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE rec record; context record;
BEGIN
 IF TG_TABLE_NAME='recommendations' THEN
  SELECT * INTO context FROM public.movie_recommendation_context WHERE recommendation_id=NEW.id;
  IF context.recommendation_id IS NULL THEN RETURN NEW;END IF;rec:=NEW;
 ELSE SELECT * INTO rec FROM public.recommendations WHERE id=NEW.recommendation_id AND account_id=NEW.account_id FOR UPDATE;context:=NEW; END IF;
 IF rec.category<>'movies' THEN RAISE EXCEPTION 'Movie context category mismatch' USING ERRCODE='23514';END IF;
 PERFORM public.validate_movie_context(rec.entity_id,context.region,context.selected_provider_ids);RETURN NEW;
END $$;
CREATE TRIGGER movie_context_constraint BEFORE INSERT OR UPDATE ON public.movie_recommendation_context FOR EACH ROW EXECUTE FUNCTION public.guard_movie_context();
CREATE TRIGGER movie_context_replacement_constraint BEFORE UPDATE OF entity_id,category ON public.recommendations FOR EACH ROW EXECUTE FUNCTION public.guard_movie_context();
REVOKE ALL ON public.movie_entity_details,public.movie_entity_provider_genres,public.taxonomy_terms,public.taxonomy_term_translations,public.movie_provider_genre_terms,public.recommendation_taxonomy,public.movie_recommendation_context FROM PUBLIC,music_runtime;
GRANT SELECT,INSERT ON public.movie_entity_details,public.movie_entity_provider_genres TO music_runtime;
GRANT SELECT ON public.taxonomy_terms,public.taxonomy_term_translations,public.movie_provider_genre_terms TO music_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.recommendation_taxonomy,public.movie_recommendation_context TO music_runtime;
REVOKE ALL ON FUNCTION public.guard_movie_details(),public.lock_movie_genre_parent(),public.guard_movie_genres(),public.guard_taxonomy_tree(),public.lock_taxonomy_tree(),public.validate_movie_context(uuid,text,bigint[]),public.guard_movie_context() FROM PUBLIC,music_runtime;

CREATE OR REPLACE FUNCTION public.explorers_content_revision_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE scope record; scope_sql text;
BEGIN
 IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME NOT IN ('collections','recommendations','collection_items','collection_media','recommendation_media','recommendation_display_overrides','book_recommendation_context','recommendation_book_covers','movie_recommendation_context','recommendation_taxonomy','category_recommendation_pins','account_category_pin_state') THEN
  RAISE EXCEPTION 'Invalid category revision trigger source' USING ERRCODE='42501';
 END IF;
 IF TG_TABLE_NAME='collection_media' THEN
  scope_sql := 'SELECT m.account_id,c.category FROM new_rows m JOIN public.collections c ON c.id=m.collection_id AND c.account_id=m.account_id';
 ELSIF TG_TABLE_NAME IN ('recommendation_media','recommendation_display_overrides','book_recommendation_context','recommendation_book_covers','movie_recommendation_context','recommendation_taxonomy') THEN
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
 IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME NOT IN ('collections','recommendations','collection_items','collection_media','recommendation_media','recommendation_display_overrides','book_recommendation_context','recommendation_book_covers','movie_recommendation_context','recommendation_taxonomy','category_recommendation_pins','account_category_pin_state') THEN
  RAISE EXCEPTION 'Invalid category revision trigger source' USING ERRCODE='42501';
 END IF;
 IF TG_TABLE_NAME='collection_media' THEN
  scope_sql := 'SELECT m.account_id,c.category FROM old_rows m JOIN public.collections c ON c.id=m.collection_id AND c.account_id=m.account_id UNION SELECT m.account_id,c.category FROM new_rows m JOIN public.collections c ON c.id=m.collection_id AND c.account_id=m.account_id';
 ELSIF TG_TABLE_NAME IN ('recommendation_media','recommendation_display_overrides','book_recommendation_context','recommendation_book_covers','movie_recommendation_context','recommendation_taxonomy') THEN
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
 IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME NOT IN ('collections','recommendations','collection_items','collection_media','recommendation_media','recommendation_display_overrides','book_recommendation_context','recommendation_book_covers','movie_recommendation_context','recommendation_taxonomy','category_recommendation_pins','account_category_pin_state') THEN
  RAISE EXCEPTION 'Invalid category revision trigger source' USING ERRCODE='42501';
 END IF;
 IF TG_TABLE_NAME='collection_media' THEN
  scope_sql := 'SELECT m.account_id,c.category FROM old_rows m JOIN public.collections c ON c.id=m.collection_id AND c.account_id=m.account_id';
 ELSIF TG_TABLE_NAME IN ('recommendation_media','recommendation_display_overrides','book_recommendation_context','recommendation_book_covers','movie_recommendation_context','recommendation_taxonomy') THEN
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



CREATE TRIGGER movie_recommendation_context_content_revision_insert AFTER INSERT ON public.movie_recommendation_context REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.explorers_content_revision_insert();
CREATE TRIGGER movie_recommendation_context_content_revision_update AFTER UPDATE ON public.movie_recommendation_context REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.explorers_content_revision_update();
CREATE TRIGGER movie_recommendation_context_content_revision_delete AFTER DELETE ON public.movie_recommendation_context REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.explorers_content_revision_delete();
CREATE TRIGGER recommendation_taxonomy_content_revision_insert AFTER INSERT ON public.recommendation_taxonomy REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.explorers_content_revision_insert();
CREATE TRIGGER recommendation_taxonomy_content_revision_update AFTER UPDATE ON public.recommendation_taxonomy REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.explorers_content_revision_update();
CREATE TRIGGER recommendation_taxonomy_content_revision_delete AFTER DELETE ON public.recommendation_taxonomy REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.explorers_content_revision_delete();
