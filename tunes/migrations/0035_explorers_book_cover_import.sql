-- Two independently copied provider slots; snapshots retain their ordered relation.
LOCK TABLE public.creator_accounts IN EXCLUSIVE MODE;
LOCK TABLE public.recommendations,public.media_assets IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE public.recommendation_book_covers (
 recommendation_id uuid NOT NULL,account_id uuid NOT NULL,slot text NOT NULL CHECK(slot IN ('cover','thumbnail')),media_id uuid NOT NULL,
 PRIMARY KEY(recommendation_id,slot),
 FOREIGN KEY(recommendation_id,account_id) REFERENCES public.recommendations(id,account_id) ON DELETE CASCADE,
 FOREIGN KEY(media_id,account_id) REFERENCES public.media_assets(id,account_id) ON DELETE RESTRICT
);
CREATE INDEX recommendation_book_covers_asset_idx ON public.recommendation_book_covers(media_id,account_id);
CREATE INDEX recommendation_book_covers_account_idx ON public.recommendation_book_covers(account_id,recommendation_id);
CREATE FUNCTION public.guard_recommendation_book_cover() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE target uuid; item record;
BEGIN
 IF TG_TABLE_NAME='media_assets' THEN
  target:=NEW.id;
  IF EXISTS(SELECT 1 FROM public.recommendation_book_covers WHERE media_id=target) AND NOT EXISTS(
   SELECT 1 FROM public.media_assets WHERE id=target AND status='ready' AND purpose='recommendation' AND mime_type IN ('image/png','image/jpeg','image/gif','image/webp') AND byte_size BETWEEN 1 AND 5242880)
  THEN RAISE EXCEPTION 'Book cover media must remain ready owned recommendation image' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='recommendations' THEN
  IF EXISTS(SELECT 1 FROM public.recommendation_book_covers WHERE recommendation_id=NEW.id) AND NOT EXISTS(SELECT 1 FROM public.recommendations WHERE id=NEW.id AND category='books')
  THEN RAISE EXCEPTION 'Book cover requires Books recommendation' USING ERRCODE='23514'; END IF;
 ELSE
  -- Check final slot state, permitting a detach/replacement in this transaction.
  SELECT * INTO item FROM public.recommendation_book_covers WHERE recommendation_id=NEW.recommendation_id AND slot=NEW.slot;
  IF FOUND THEN
   PERFORM 1 FROM public.media_assets WHERE id=item.media_id AND account_id=item.account_id AND status='ready' AND purpose='recommendation' AND mime_type IN ('image/png','image/jpeg','image/gif','image/webp') AND byte_size BETWEEN 1 AND 5242880 FOR SHARE;
   IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.recommendations WHERE id=item.recommendation_id AND account_id=item.account_id AND category='books') THEN RAISE EXCEPTION 'Invalid Book cover relation' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER recommendation_book_cover_ready_guard AFTER INSERT OR UPDATE ON public.recommendation_book_covers DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_recommendation_book_cover();
CREATE CONSTRAINT TRIGGER media_asset_book_cover_reverse_guard AFTER UPDATE OF status,purpose,mime_type,byte_size ON public.media_assets DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_recommendation_book_cover();
CREATE CONSTRAINT TRIGGER recommendation_book_cover_category_guard AFTER UPDATE OF category ON public.recommendations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_recommendation_book_cover();
REVOKE ALL ON public.recommendation_book_covers FROM PUBLIC,music_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.recommendation_book_covers TO music_runtime;
REVOKE ALL ON FUNCTION public.guard_recommendation_book_cover() FROM PUBLIC,music_runtime;
-- Pending import progress survives socket/storage/process failure without holding
-- a transaction across remote I/O. Existing commands still accept completed only.
ALTER TABLE public.application_command_receipts DROP CONSTRAINT application_command_receipts_status_check;
ALTER TABLE public.application_command_receipts ADD CONSTRAINT application_command_receipts_status_check CHECK(status IN ('pending','completed','retired'));
ALTER TABLE public.application_command_receipts DROP CONSTRAINT application_receipt_response_check;
ALTER TABLE public.application_command_receipts ADD CONSTRAINT application_receipt_response_check CHECK((status IN ('pending','completed'))=(response IS NOT NULL));
CREATE OR REPLACE FUNCTION public.explorers_content_revision_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE scope record; scope_sql text;
BEGIN
 IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME NOT IN ('collections','recommendations','collection_items','collection_media','recommendation_media','recommendation_display_overrides','book_recommendation_context','recommendation_book_covers','category_recommendation_pins','account_category_pin_state') THEN
  RAISE EXCEPTION 'Invalid category revision trigger source' USING ERRCODE='42501';
 END IF;
 IF TG_TABLE_NAME='collection_media' THEN
  scope_sql := 'SELECT m.account_id,c.category FROM new_rows m JOIN public.collections c ON c.id=m.collection_id AND c.account_id=m.account_id';
 ELSIF TG_TABLE_NAME IN ('recommendation_media','recommendation_display_overrides','book_recommendation_context','recommendation_book_covers') THEN
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
 IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME NOT IN ('collections','recommendations','collection_items','collection_media','recommendation_media','recommendation_display_overrides','book_recommendation_context','recommendation_book_covers','category_recommendation_pins','account_category_pin_state') THEN
  RAISE EXCEPTION 'Invalid category revision trigger source' USING ERRCODE='42501';
 END IF;
 IF TG_TABLE_NAME='collection_media' THEN
  scope_sql := 'SELECT m.account_id,c.category FROM old_rows m JOIN public.collections c ON c.id=m.collection_id AND c.account_id=m.account_id UNION SELECT m.account_id,c.category FROM new_rows m JOIN public.collections c ON c.id=m.collection_id AND c.account_id=m.account_id';
 ELSIF TG_TABLE_NAME IN ('recommendation_media','recommendation_display_overrides','book_recommendation_context','recommendation_book_covers') THEN
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
 IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME NOT IN ('collections','recommendations','collection_items','collection_media','recommendation_media','recommendation_display_overrides','book_recommendation_context','recommendation_book_covers','category_recommendation_pins','account_category_pin_state') THEN
  RAISE EXCEPTION 'Invalid category revision trigger source' USING ERRCODE='42501';
 END IF;
 IF TG_TABLE_NAME='collection_media' THEN
  scope_sql := 'SELECT m.account_id,c.category FROM old_rows m JOIN public.collections c ON c.id=m.collection_id AND c.account_id=m.account_id';
 ELSIF TG_TABLE_NAME IN ('recommendation_media','recommendation_display_overrides','book_recommendation_context','recommendation_book_covers') THEN
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



CREATE TRIGGER recommendation_book_covers_content_revision_insert AFTER INSERT ON public.recommendation_book_covers REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.explorers_content_revision_insert();
CREATE TRIGGER recommendation_book_covers_content_revision_update AFTER UPDATE ON public.recommendation_book_covers REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.explorers_content_revision_update();
CREATE TRIGGER recommendation_book_covers_content_revision_delete AFTER DELETE ON public.recommendation_book_covers REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.explorers_content_revision_delete();