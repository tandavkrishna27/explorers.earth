-- Individual Places sequences. Operational policy and expiry are supplied explicitly.
-- Full transaction markers are private trigger capabilities, never caller settings.
LOCK TABLE public.creator_accounts IN EXCLUSIVE MODE;
LOCK TABLE public.account_category_content_state,public.account_category_pin_state,
 public.book_recommendation_context,public.category_recommendation_pins,
 public.collection_items,public.collection_location_links,public.collection_media,public.collections,
 public.entities,public.guide_collection_details,public.guide_section_photos,public.guide_sections,
 public.movie_recommendation_context,public.place_collection_details,public.place_recommendation_context,
 public.product_recommendation_context,public.recommendation_app_screenshots,public.recommendation_book_covers,
 public.recommendation_display_overrides,public.recommendation_media,public.recommendation_movie_media,
 public.recommendation_place_photos,public.recommendation_taxonomy,public.recommendations IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.account_category_content_state ADD COLUMN places_last_mutation_xid xid8;
CREATE TABLE public.places_collection_mutation_state (
 collection_id uuid PRIMARY KEY REFERENCES public.collections(id) ON DELETE CASCADE,
 last_mutation_xid xid8 NOT NULL
);
-- Transaction-owned queues have no parent FKs: a queued deletion still validates
-- the empty final scope. Validators delete their entry, so later writes (including
-- after SET CONSTRAINTS IMMEDIATE or deferred cascades) can queue it anew.
CREATE TABLE public.places_pin_validation_dirty (
 validation_xid xid8 NOT NULL, collection_id uuid NOT NULL,
 PRIMARY KEY(validation_xid,collection_id)
);
CREATE TABLE public.places_chunk_validation_dirty (
 validation_xid xid8 NOT NULL, draft_id uuid NOT NULL, chunk_index bigint NOT NULL,
 PRIMARY KEY(validation_xid,draft_id,chunk_index)
);
CREATE TABLE public.collection_place_pins (
 collection_id uuid NOT NULL, recommendation_id uuid NOT NULL, account_id uuid NOT NULL,
 category text NOT NULL CHECK(category='places'),
 position bigint NOT NULL CHECK(position BETWEEN 0 AND 9007199254740990),
 PRIMARY KEY(collection_id,recommendation_id),
 UNIQUE(collection_id,position) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(collection_id,account_id,category) REFERENCES public.collections(id,account_id,category) ON DELETE CASCADE,
 FOREIGN KEY(recommendation_id,account_id,category) REFERENCES public.recommendations(id,account_id,category) ON DELETE CASCADE,
 FOREIGN KEY(collection_id,recommendation_id) REFERENCES public.collection_items(collection_id,recommendation_id) ON DELETE CASCADE
);
CREATE INDEX collection_place_pins_recommendation_idx ON public.collection_place_pins(recommendation_id,collection_id);
CREATE INDEX collection_place_pins_order_idx ON public.collection_place_pins(collection_id,position,recommendation_id);
CREATE TABLE public.place_pin_drafts (
 id uuid PRIMARY KEY, collection_id uuid NOT NULL, account_id uuid NOT NULL,
 category text NOT NULL CHECK(category='places'),
 expected_collection_revision bigint NOT NULL CHECK(expected_collection_revision BETWEEN 1 AND 9007199254740991),
 expected_category_content_revision bigint NOT NULL CHECK(expected_category_content_revision BETWEEN 0 AND 9007199254740991),
 policy_id text NOT NULL CHECK(length(policy_id)>0),
 policy_version bigint NOT NULL CHECK(policy_version BETWEEN 1 AND 9007199254740991),
 policy_snapshot jsonb NOT NULL CHECK(jsonb_typeof(policy_snapshot)='object'),
 created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL CHECK(expires_at>created_at),
 state text NOT NULL CHECK(state IN ('open','committed','aborted','expired')),
 accepted_bytes bigint NOT NULL CHECK(accepted_bytes BETWEEN 0 AND 9007199254740991),
 item_count bigint NOT NULL CHECK(item_count BETWEEN 0 AND 9007199254740991),
 chunk_count bigint NOT NULL CHECK(chunk_count BETWEEN 0 AND 9007199254740991),
 terminal_at timestamptz, terminal_result jsonb,
 CHECK((state='open')=(terminal_at IS NULL)),
 CHECK(state<>'open' OR terminal_result IS NULL),
 CHECK(state='open' OR (accepted_bytes=0 AND item_count=0 AND chunk_count=0)),
 FOREIGN KEY(collection_id,account_id,category) REFERENCES public.collections(id,account_id,category) ON DELETE CASCADE
);
CREATE INDEX place_pin_drafts_owner_idx ON public.place_pin_drafts(account_id,state,expires_at,id);
CREATE INDEX place_pin_drafts_collection_idx ON public.place_pin_drafts(collection_id,id);
CREATE TABLE public.place_pin_draft_chunks (
 draft_id uuid NOT NULL REFERENCES public.place_pin_drafts(id) ON DELETE CASCADE,
 chunk_index bigint NOT NULL CHECK(chunk_index BETWEEN 0 AND 9007199254740990),
 hash bytea NOT NULL CHECK(octet_length(hash)=32),
 item_count bigint NOT NULL CHECK(item_count BETWEEN 0 AND 9007199254740991),
 admitted_bytes bigint NOT NULL CHECK(admitted_bytes BETWEEN 0 AND 9007199254740991),
 acknowledgement jsonb NOT NULL CHECK(jsonb_typeof(acknowledgement)='object'),
 PRIMARY KEY(draft_id,chunk_index)
);
CREATE TABLE public.place_pin_draft_items (
 draft_id uuid NOT NULL, chunk_index bigint NOT NULL,
 item_index bigint NOT NULL CHECK(item_index BETWEEN 0 AND 9007199254740990), recommendation_id uuid NOT NULL,
 PRIMARY KEY(draft_id,chunk_index,item_index),
 FOREIGN KEY(draft_id,chunk_index) REFERENCES public.place_pin_draft_chunks(draft_id,chunk_index) ON DELETE CASCADE
);

CREATE FUNCTION public.explorers_places_category_mutation(target_account uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF pg_catalog.pg_trigger_depth()<1 THEN RAISE EXCEPTION 'Trigger authority required' USING ERRCODE='42501'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(44031,pg_catalog.hashtext(target_account::text || ':places'));
 INSERT INTO public.account_category_content_state(account_id,category,revision,places_last_mutation_xid)
 VALUES(target_account,'places',1,pg_catalog.pg_current_xact_id())
 ON CONFLICT(account_id,category) DO UPDATE SET revision=public.account_category_content_state.revision+1,
 places_last_mutation_xid=EXCLUDED.places_last_mutation_xid
 WHERE public.account_category_content_state.places_last_mutation_xid IS DISTINCT FROM EXCLUDED.places_last_mutation_xid;
END $$;

CREATE FUNCTION public.explorers_places_collection_claim(target_collection uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE claimed uuid;
BEGIN
 IF pg_catalog.pg_trigger_depth()<1 THEN RAISE EXCEPTION 'Trigger authority required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.collections WHERE id=target_collection AND category='places' FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 INSERT INTO public.places_collection_mutation_state(collection_id,last_mutation_xid)
 VALUES(target_collection,pg_catalog.pg_current_xact_id())
 ON CONFLICT(collection_id) DO UPDATE SET last_mutation_xid=EXCLUDED.last_mutation_xid
 WHERE public.places_collection_mutation_state.last_mutation_xid IS DISTINCT FROM EXCLUDED.last_mutation_xid
 RETURNING collection_id INTO claimed;
 RETURN claimed IS NOT NULL;
END $$;

CREATE FUNCTION public.explorers_place_pins_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE target uuid;
BEGIN
 IF TG_TABLE_SCHEMA<>'public' OR TG_TABLE_NAME<>'collection_place_pins' OR TG_WHEN<>'AFTER' THEN
  RAISE EXCEPTION 'Invalid pin revision source' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NULL; END IF;
 FOR target IN SELECT DISTINCT id FROM unnest(CASE WHEN TG_OP='INSERT' THEN ARRAY[NEW.collection_id]
  WHEN TG_OP='DELETE' THEN ARRAY[OLD.collection_id] ELSE ARRAY[OLD.collection_id,NEW.collection_id] END) id ORDER BY id LOOP
  IF public.explorers_places_collection_claim(target) THEN
   UPDATE public.collections SET revision=revision+1,updated_at=clock_timestamp() WHERE id=target AND category='places';
  END IF;
 END LOOP;
 RETURN NULL;
END $$;
CREATE TRIGGER collection_place_pins_revision AFTER INSERT OR UPDATE OR DELETE ON public.collection_place_pins
 FOR EACH ROW EXECUTE FUNCTION public.explorers_place_pins_revision();

CREATE FUNCTION public.explorers_place_pins_cleanup() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE target uuid; first_claim boolean;
BEGIN
 IF TG_TABLE_SCHEMA<>'public' OR TG_WHEN<>'BEFORE' OR TG_TABLE_NAME NOT IN ('collections','recommendations','collection_items','entities') THEN
  RAISE EXCEPTION 'Invalid pin cleanup source' USING ERRCODE='42501'; END IF;
 IF TG_TABLE_NAME='collections' THEN
  IF OLD.category<>'places' THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
  IF TG_OP='UPDATE' AND NEW.archived_at IS NOT DISTINCT FROM OLD.archived_at AND NEW.id=OLD.id
    AND NEW.account_id=OLD.account_id AND NEW.category=OLD.category THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND NEW.archived_at IS NULL AND NEW.id=OLD.id AND NEW.account_id=OLD.account_id AND NEW.category=OLD.category THEN RETURN NEW; END IF;
  -- Claim before deleting children: never issue a nested UPDATE of this parent.
  first_claim:=public.explorers_places_collection_claim(OLD.id);
  IF TG_OP='UPDATE' THEN
   IF first_claim THEN
    IF OLD.revision>=9007199254740991 THEN RAISE EXCEPTION 'Collection revision exhausted' USING ERRCODE='22003'; END IF;
    NEW.revision:=OLD.revision+1;
   ELSE NEW.revision:=OLD.revision; END IF;
  END IF;
  DELETE FROM public.collection_place_pins WHERE collection_id=OLD.id;
  UPDATE public.place_pin_drafts SET state='aborted',terminal_at=clock_timestamp(),terminal_result=NULL,
   accepted_bytes=0,item_count=0,chunk_count=0
   WHERE collection_id=OLD.id AND state='open';
  DELETE FROM public.place_pin_draft_chunks WHERE draft_id IN (SELECT id FROM public.place_pin_drafts WHERE collection_id=OLD.id AND state<>'open');
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
 ELSIF TG_TABLE_NAME='recommendations' THEN
  IF TG_OP='UPDATE' AND NEW.archived_at IS NULL AND NEW.category='places' AND NEW.id=OLD.id AND NEW.account_id=OLD.account_id
   AND EXISTS(SELECT 1 FROM public.entities WHERE id=NEW.entity_id AND kind IN ('place','person')) THEN RETURN NEW; END IF;
  FOR target IN SELECT collection_id FROM public.collection_place_pins WHERE recommendation_id=OLD.id ORDER BY collection_id LOOP
   PERFORM 1 FROM public.collections WHERE id=target FOR UPDATE;
   DELETE FROM public.collection_place_pins WHERE collection_id=target AND recommendation_id=OLD.id;
   WITH ranked AS (SELECT recommendation_id,row_number() OVER(ORDER BY position,recommendation_id)-1 AS rank FROM public.collection_place_pins WHERE collection_id=target)
    UPDATE public.collection_place_pins p SET position=ranked.rank FROM ranked WHERE p.collection_id=target AND p.recommendation_id=ranked.recommendation_id AND p.position<>ranked.rank;
  END LOOP;
 ELSIF TG_TABLE_NAME='collection_items' THEN
  IF TG_OP='UPDATE' AND NEW.collection_id=OLD.collection_id AND NEW.recommendation_id=OLD.recommendation_id
   AND NEW.account_id=OLD.account_id AND NEW.category=OLD.category THEN RETURN NEW; END IF;
  target:=OLD.collection_id;
  PERFORM 1 FROM public.collections WHERE id=target FOR UPDATE;
  DELETE FROM public.collection_place_pins WHERE collection_id=target AND recommendation_id=OLD.recommendation_id;
  WITH ranked AS (SELECT recommendation_id,row_number() OVER(ORDER BY position,recommendation_id)-1 AS rank FROM public.collection_place_pins WHERE collection_id=target)
   UPDATE public.collection_place_pins p SET position=ranked.rank FROM ranked WHERE p.collection_id=target AND p.recommendation_id=ranked.recommendation_id AND p.position<>ranked.rank;
 ELSE
  IF TG_OP='UPDATE' AND NEW.kind IN ('place','person') AND NEW.id=OLD.id THEN RETURN NEW; END IF;
  FOR target IN SELECT DISTINCT p.collection_id FROM public.collection_place_pins p JOIN public.recommendations r ON r.id=p.recommendation_id WHERE r.entity_id=OLD.id ORDER BY p.collection_id LOOP
   PERFORM 1 FROM public.collections WHERE id=target FOR UPDATE;
   DELETE FROM public.collection_place_pins p USING public.recommendations r WHERE p.collection_id=target AND r.id=p.recommendation_id AND r.entity_id=OLD.id;
   WITH ranked AS (SELECT recommendation_id,row_number() OVER(ORDER BY position,recommendation_id)-1 AS rank FROM public.collection_place_pins WHERE collection_id=target)
    UPDATE public.collection_place_pins p SET position=ranked.rank FROM ranked WHERE p.collection_id=target AND p.recommendation_id=ranked.recommendation_id AND p.position<>ranked.rank;
  END LOOP;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER places_collection_cleanup BEFORE UPDATE OR DELETE ON public.collections FOR EACH ROW EXECUTE FUNCTION public.explorers_place_pins_cleanup();
CREATE TRIGGER places_recommendation_cleanup BEFORE UPDATE OR DELETE ON public.recommendations FOR EACH ROW EXECUTE FUNCTION public.explorers_place_pins_cleanup();
CREATE TRIGGER places_membership_cleanup BEFORE UPDATE OR DELETE ON public.collection_items FOR EACH ROW EXECUTE FUNCTION public.explorers_place_pins_cleanup();
CREATE TRIGGER places_entity_cleanup BEFORE UPDATE OR DELETE ON public.entities FOR EACH ROW EXECUTE FUNCTION public.explorers_place_pins_cleanup();

CREATE FUNCTION public.explorers_place_pins_dirty() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE target uuid;
BEGIN
 IF TG_TABLE_SCHEMA<>'public' OR TG_WHEN<>'AFTER' OR TG_TABLE_NAME NOT IN ('collection_place_pins','collections','recommendations','collection_items','entities') THEN
  RAISE EXCEPTION 'Invalid pin dirty source' USING ERRCODE='42501'; END IF;
 IF TG_TABLE_NAME IN ('collection_place_pins','collection_items','collections') THEN
  -- Constant-sized scope discovery on each row; never traverse the live sequence.
  FOR target IN SELECT DISTINCT value::uuid FROM unnest(CASE WHEN TG_TABLE_NAME='collections'
   THEN ARRAY[to_jsonb(OLD)->>'id',to_jsonb(NEW)->>'id']
   ELSE ARRAY[to_jsonb(OLD)->>'collection_id',to_jsonb(NEW)->>'collection_id'] END) value WHERE value IS NOT NULL ORDER BY value::uuid LOOP
   INSERT INTO public.places_pin_validation_dirty(validation_xid,collection_id)
    VALUES(pg_catalog.pg_current_xact_id(),target) ON CONFLICT(validation_xid,collection_id) DO NOTHING;
  END LOOP;
 ELSIF TG_TABLE_NAME='recommendations' THEN
  INSERT INTO public.places_pin_validation_dirty(validation_xid,collection_id)
   SELECT DISTINCT pg_catalog.pg_current_xact_id(),p.collection_id FROM public.collection_place_pins p
    WHERE p.recommendation_id IN ((to_jsonb(OLD)->>'id')::uuid,(to_jsonb(NEW)->>'id')::uuid)
   ON CONFLICT(validation_xid,collection_id) DO NOTHING;
 ELSE
  INSERT INTO public.places_pin_validation_dirty(validation_xid,collection_id)
   SELECT DISTINCT pg_catalog.pg_current_xact_id(),p.collection_id FROM public.collection_place_pins p
    JOIN public.recommendations r ON r.id=p.recommendation_id
    WHERE r.entity_id IN ((to_jsonb(OLD)->>'id')::uuid,(to_jsonb(NEW)->>'id')::uuid)
   ON CONFLICT(validation_xid,collection_id) DO NOTHING;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER collection_place_pins_dirty AFTER INSERT OR UPDATE OR DELETE ON public.collection_place_pins FOR EACH ROW EXECUTE FUNCTION public.explorers_place_pins_dirty();
CREATE TRIGGER places_collection_pins_dirty AFTER INSERT OR UPDATE OR DELETE ON public.collections FOR EACH ROW EXECUTE FUNCTION public.explorers_place_pins_dirty();
CREATE TRIGGER places_recommendation_pins_dirty AFTER INSERT OR UPDATE OR DELETE ON public.recommendations FOR EACH ROW EXECUTE FUNCTION public.explorers_place_pins_dirty();
CREATE TRIGGER places_membership_pins_dirty AFTER INSERT OR UPDATE OR DELETE ON public.collection_items FOR EACH ROW EXECUTE FUNCTION public.explorers_place_pins_dirty();
CREATE TRIGGER places_entity_pins_dirty AFTER UPDATE OR DELETE ON public.entities FOR EACH ROW EXECUTE FUNCTION public.explorers_place_pins_dirty();

CREATE FUNCTION public.explorers_place_pins_validate() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE target uuid;
BEGIN
 IF TG_TABLE_SCHEMA<>'public' OR TG_TABLE_NAME<>'places_pin_validation_dirty' OR TG_WHEN<>'AFTER' OR TG_OP<>'INSERT'
  OR NEW.validation_xid IS DISTINCT FROM pg_catalog.pg_current_xact_id() THEN
  RAISE EXCEPTION 'Invalid pin validation source' USING ERRCODE='42501'; END IF;
 target:=NEW.collection_id;
 IF EXISTS(SELECT 1 FROM public.collection_place_pins p
   JOIN public.collections c ON c.id=p.collection_id JOIN public.recommendations r ON r.id=p.recommendation_id
   JOIN public.entities e ON e.id=r.entity_id
   LEFT JOIN public.collection_items m ON m.collection_id=p.collection_id AND m.recommendation_id=p.recommendation_id
   WHERE p.collection_id=target AND (c.archived_at IS NOT NULL OR r.archived_at IS NOT NULL OR c.category<>'places' OR r.category<>'places'
    OR c.account_id<>p.account_id OR r.account_id<>p.account_id OR m.recommendation_id IS NULL OR e.kind NOT IN ('place','person')))
   OR EXISTS(SELECT 1 FROM (SELECT position,row_number() OVER(ORDER BY position,recommendation_id)-1 AS rank FROM public.collection_place_pins WHERE collection_id=target) s WHERE position<>rank)
 THEN RAISE EXCEPTION 'Places pins require active owned members and dense ranks' USING ERRCODE='23514'; END IF;
 DELETE FROM public.places_pin_validation_dirty WHERE validation_xid=NEW.validation_xid AND collection_id=target;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER places_pin_validation_final AFTER INSERT ON public.places_pin_validation_dirty DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.explorers_place_pins_validate();

CREATE FUNCTION public.explorers_place_draft_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE draft_state text;
BEGIN
 IF TG_TABLE_SCHEMA<>'public' OR TG_TABLE_NAME NOT IN ('place_pin_drafts','place_pin_draft_chunks','place_pin_draft_items') THEN
  RAISE EXCEPTION 'Invalid staging guard source' USING ERRCODE='42501'; END IF;
 IF TG_TABLE_NAME='place_pin_drafts' THEN
  IF TG_OP='UPDATE' AND ((to_jsonb(NEW)-ARRAY['state','accepted_bytes','item_count','chunk_count','terminal_at','terminal_result'])
   IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','accepted_bytes','item_count','chunk_count','terminal_at','terminal_result']) OR OLD.state<>'open') THEN
   RAISE EXCEPTION 'Draft identity and terminal result are immutable' USING ERRCODE='23514'; END IF;
 ELSE
  IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Accepted chunk content is immutable' USING ERRCODE='23514'; END IF;
  IF TG_OP='INSERT' THEN
   SELECT state INTO draft_state FROM public.place_pin_drafts WHERE id=NEW.draft_id FOR UPDATE;
   IF draft_state IS DISTINCT FROM 'open' THEN RAISE EXCEPTION 'Open draft required' USING ERRCODE='23514'; END IF;
  ELSIF TG_OP='DELETE' THEN
   SELECT state INTO draft_state FROM public.place_pin_drafts WHERE id=OLD.draft_id FOR UPDATE;
   IF draft_state='open' AND (TG_TABLE_NAME='place_pin_draft_chunks' OR EXISTS(
    SELECT 1 FROM public.place_pin_draft_chunks WHERE draft_id=OLD.draft_id AND chunk_index=OLD.chunk_index)) THEN
    RAISE EXCEPTION 'Accepted chunk deletion requires terminal draft' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER place_pin_drafts_immutable BEFORE UPDATE ON public.place_pin_drafts FOR EACH ROW EXECUTE FUNCTION public.explorers_place_draft_immutable();
CREATE TRIGGER place_pin_draft_chunks_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.place_pin_draft_chunks FOR EACH ROW EXECUTE FUNCTION public.explorers_place_draft_immutable();
CREATE TRIGGER place_pin_draft_items_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.place_pin_draft_items FOR EACH ROW EXECUTE FUNCTION public.explorers_place_draft_immutable();

CREATE FUNCTION public.explorers_place_chunk_dirty() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_TABLE_SCHEMA<>'public' OR TG_TABLE_NAME NOT IN ('place_pin_draft_chunks','place_pin_draft_items') OR TG_WHEN<>'AFTER' THEN
  RAISE EXCEPTION 'Invalid chunk dirty source' USING ERRCODE='42501'; END IF;
 INSERT INTO public.places_chunk_validation_dirty(validation_xid,draft_id,chunk_index)
  VALUES(pg_catalog.pg_current_xact_id(),coalesce(NEW.draft_id,OLD.draft_id),coalesce(NEW.chunk_index,OLD.chunk_index))
  ON CONFLICT(validation_xid,draft_id,chunk_index) DO NOTHING;
 RETURN NULL;
END $$;
CREATE TRIGGER place_pin_draft_chunks_dirty AFTER INSERT ON public.place_pin_draft_chunks FOR EACH ROW EXECUTE FUNCTION public.explorers_place_chunk_dirty();
CREATE TRIGGER place_pin_draft_items_dirty AFTER INSERT OR UPDATE OR DELETE ON public.place_pin_draft_items FOR EACH ROW EXECUTE FUNCTION public.explorers_place_chunk_dirty();

CREATE FUNCTION public.explorers_place_chunk_validate() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE target_draft uuid; target_chunk bigint; expected_count bigint; actual_count bigint; lowest bigint; highest bigint;
BEGIN
 IF TG_TABLE_SCHEMA<>'public' OR TG_TABLE_NAME<>'places_chunk_validation_dirty' OR TG_WHEN<>'AFTER' OR TG_OP<>'INSERT'
  OR NEW.validation_xid IS DISTINCT FROM pg_catalog.pg_current_xact_id() THEN
  RAISE EXCEPTION 'Invalid chunk validation source' USING ERRCODE='42501'; END IF;
 target_draft:=NEW.draft_id; target_chunk:=NEW.chunk_index;
 SELECT item_count INTO expected_count FROM public.place_pin_draft_chunks WHERE draft_id=target_draft AND chunk_index=target_chunk;
 IF FOUND THEN
  SELECT count(*),min(item_index),max(item_index) INTO actual_count,lowest,highest
  FROM public.place_pin_draft_items WHERE draft_id=target_draft AND chunk_index=target_chunk;
  IF actual_count<>expected_count OR (actual_count>0 AND (lowest<>0 OR highest<>actual_count-1)) THEN
   RAISE EXCEPTION 'Chunk item count and ordinals must match accepted content' USING ERRCODE='23514'; END IF;
 END IF;
 DELETE FROM public.places_chunk_validation_dirty WHERE validation_xid=NEW.validation_xid AND draft_id=target_draft AND chunk_index=target_chunk;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER places_chunk_validation_final AFTER INSERT ON public.places_chunk_validation_dirty DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.explorers_place_chunk_validate();

REVOKE ALL ON public.places_collection_mutation_state FROM PUBLIC,music_runtime;
REVOKE ALL ON public.places_pin_validation_dirty FROM PUBLIC,music_runtime;
REVOKE ALL ON public.places_chunk_validation_dirty FROM PUBLIC,music_runtime;
REVOKE ALL ON public.collection_place_pins,public.place_pin_drafts,public.place_pin_draft_chunks,public.place_pin_draft_items FROM PUBLIC,music_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.collection_place_pins,public.place_pin_drafts TO music_runtime;
GRANT SELECT,INSERT,DELETE ON public.place_pin_draft_chunks,public.place_pin_draft_items TO music_runtime;
REVOKE ALL ON FUNCTION public.explorers_places_category_mutation(uuid) FROM PUBLIC,music_runtime;
REVOKE ALL ON FUNCTION public.explorers_places_collection_claim(uuid) FROM PUBLIC,music_runtime;
REVOKE ALL ON FUNCTION public.explorers_place_pins_revision() FROM PUBLIC,music_runtime;
REVOKE ALL ON FUNCTION public.explorers_place_pins_cleanup() FROM PUBLIC,music_runtime;
REVOKE ALL ON FUNCTION public.explorers_place_pins_validate() FROM PUBLIC,music_runtime;
REVOKE ALL ON FUNCTION public.explorers_place_draft_immutable() FROM PUBLIC,music_runtime;
REVOKE ALL ON FUNCTION public.explorers_place_chunk_validate() FROM PUBLIC,music_runtime;
REVOKE ALL ON FUNCTION public.explorers_place_pins_dirty() FROM PUBLIC,music_runtime;
REVOKE ALL ON FUNCTION public.explorers_place_chunk_dirty() FROM PUBLIC,music_runtime;

CREATE OR REPLACE FUNCTION public.explorers_content_revision_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE scope record; scope_sql text;
BEGIN
 IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME NOT IN ('collections','recommendations','collection_items','collection_media','collection_location_links','place_collection_details','guide_collection_details','guide_sections','guide_section_photos','recommendation_media','recommendation_display_overrides','book_recommendation_context','recommendation_book_covers','movie_recommendation_context','product_recommendation_context','place_recommendation_context','recommendation_place_photos','recommendation_taxonomy','recommendation_movie_media','recommendation_app_screenshots','category_recommendation_pins','account_category_pin_state') THEN
  RAISE EXCEPTION 'Invalid category revision trigger source' USING ERRCODE='42501';
 END IF;
 IF TG_TABLE_NAME='collection_location_links' THEN
  scope_sql := 'SELECT m.account_id,c.category FROM new_rows m JOIN public.collections c ON c.account_id=m.account_id AND c.id IN (m.child_collection_id,m.location_collection_id)';
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
 IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME NOT IN ('collections','recommendations','collection_items','collection_media','collection_location_links','place_collection_details','guide_collection_details','guide_sections','guide_section_photos','recommendation_media','recommendation_display_overrides','book_recommendation_context','recommendation_book_covers','movie_recommendation_context','product_recommendation_context','place_recommendation_context','recommendation_place_photos','recommendation_taxonomy','recommendation_movie_media','recommendation_app_screenshots','category_recommendation_pins','account_category_pin_state') THEN
  RAISE EXCEPTION 'Invalid category revision trigger source' USING ERRCODE='42501';
 END IF;
 IF TG_TABLE_NAME='collection_location_links' THEN
  scope_sql := 'SELECT m.account_id,c.category FROM old_rows m JOIN public.collections c ON c.account_id=m.account_id AND c.id IN (m.child_collection_id,m.location_collection_id) UNION SELECT m.account_id,c.category FROM new_rows m JOIN public.collections c ON c.account_id=m.account_id AND c.id IN (m.child_collection_id,m.location_collection_id)';
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
 IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME NOT IN ('collections','recommendations','collection_items','collection_media','collection_location_links','place_collection_details','guide_collection_details','guide_sections','guide_section_photos','recommendation_media','recommendation_display_overrides','book_recommendation_context','recommendation_book_covers','movie_recommendation_context','product_recommendation_context','place_recommendation_context','recommendation_place_photos','recommendation_taxonomy','recommendation_movie_media','recommendation_app_screenshots','category_recommendation_pins','account_category_pin_state') THEN
  RAISE EXCEPTION 'Invalid category revision trigger source' USING ERRCODE='42501';
 END IF;
 IF TG_TABLE_NAME='collection_location_links' THEN
  scope_sql := 'SELECT m.account_id,c.category FROM old_rows m JOIN public.collections c ON c.account_id=m.account_id AND c.id IN (m.child_collection_id,m.location_collection_id)';
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

CREATE OR REPLACE FUNCTION public.explorers_content_revision_lifecycle() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE scope_category text;
BEGIN
 IF TG_TABLE_SCHEMA<>'public' OR TG_TABLE_NAME<>'creator_accounts' OR TG_OP<>'UPDATE' OR TG_WHEN<>'AFTER' THEN
  RAISE EXCEPTION 'Invalid lifecycle revision source' USING ERRCODE='42501'; END IF;
 FOR scope_category IN SELECT category FROM unnest(ARRAY['apps','books','games','guides','movies','people','places','products']) category ORDER BY category LOOP
  PERFORM pg_catalog.pg_advisory_xact_lock(44031,pg_catalog.hashtext(NEW.id::text || ':' || scope_category));
  IF scope_category='places' THEN
   PERFORM public.explorers_places_category_mutation(NEW.id);
  ELSE
  INSERT INTO public.account_category_content_state(account_id,category,revision) VALUES(NEW.id,scope_category,1)
   ON CONFLICT(account_id,category) DO UPDATE SET revision=public.account_category_content_state.revision+1;
  END IF;
 END LOOP;
 RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.purge_explorers_account_content(target_account uuid,target_operation uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE current_status text; eligible boolean; removed_collections integer; removed_recommendations integer; scope_category text;
BEGIN
 PERFORM public.lock_explorers_taxonomy_catalog('people');
 PERFORM public.lock_explorers_taxonomy_catalog('places');
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
 DELETE FROM public.place_pin_drafts WHERE account_id=target_account;
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
