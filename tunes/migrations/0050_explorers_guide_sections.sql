-- Guides: an account-owned collection with ordered, versioned sections. Ticket 5.3.
--
-- Why guides get their own tables instead of flowing through recommendations and
-- collection_items, which is what every other category does:
--
-- A guide section's places are denormalised provider snapshots. The section records what
-- the author arranged on day three - the name, the address, the coordinates, the price and
-- the tips as they stood - and a published itinerary must keep saying that after the cafe
-- closes or is renamed. Every other category points at a shared entity precisely so that a
-- correction reaches everyone who recommended it. Those are opposite requirements, and
-- forcing guides through the shared-entity model would either rewrite published itineraries
-- or fill `entities` with one private row per author per stop.
--
-- The consequence worth stating plainly: migration 0029's CHECK constraints on
-- `recommendations.category` (0029:40) and `collection_items.category` (0029:51) omit
-- 'guides', and this migration deliberately LEAVES THEM ALONE. A guides recommendation row
-- is rejected by the database, and under this design that is the correct behaviour - it is
-- the constraint that makes "a guide is never flattened into item rows" true in storage
-- rather than by convention. Widening those CHECKs, which an earlier reading of this ticket
-- called for, would delete that guarantee and buy nothing: no code path writes either row
-- for a guide. `collections.category` (0029:25) already admits 'guides', so the parent
-- needs no change.
--
-- Three tables:
--   guide_collection_details - the parent's own fields. Title, description, slug,
--     visibility, display order and pin order stay on `collections`, so a guide is pinned,
--     ordered, published and archived by exactly the machinery every other list uses.
--   guide_sections - the ordered sections, with a deferrable unique order so one
--     transaction can renumber a whole day without passing through a duplicate.
--   guide_section_photos - the referential integrity for photo ids that are carried inside
--     the section's block JSON. See the note on that table.
LOCK TABLE public.creator_accounts IN EXCLUSIVE MODE;
LOCK TABLE public.collections,public.entities,public.media_assets IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE public.guide_collection_details (
 collection_id uuid PRIMARY KEY,
 account_id uuid NOT NULL,
 category text NOT NULL DEFAULT 'guides' CHECK(category='guides'),
 guide_type text CHECK(guide_type IS NULL OR guide_type IN ('itinerary','city','experience','collection')),
 multi_city boolean NOT NULL DEFAULT false,
 number_of_days integer CHECK(number_of_days IS NULL OR number_of_days BETWEEN 1 AND 365),
 estimated_budget numeric(14,2) CHECK(estimated_budget IS NULL OR estimated_budget>=0),
 budget_currency text CHECK(budget_currency IS NULL OR budget_currency ~ '^[A-Z]{3}$'),
 budget_type text CHECK(budget_type IS NULL OR budget_type IN ('per-person','total')),
 -- A budget without its currency is not an amount, and a budget type without an amount
 -- describes nothing. Both are column-local, so they belong here rather than in a trigger.
 CHECK((estimated_budget IS NULL)=(budget_currency IS NULL)),
 CHECK(estimated_budget IS NOT NULL OR budget_type IS NULL),
 best_time_to_visit jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(best_time_to_visit)='array' AND jsonb_array_length(best_time_to_visit)<=24),
 categories jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(categories)='array' AND jsonb_array_length(categories)<=24),
 tags jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(tags)='array' AND jsonb_array_length(tags)<=50),
 tips_notes jsonb CHECK(tips_notes IS NULL OR jsonb_typeof(tips_notes) IN ('object','array')),
 -- The guide's own place. The snapshot is what the header renders; location_entity_id is
 -- who the place is. Keeping them apart is what stops a renamed city from silently
 -- rewriting a published guide, and it is the same split place_collection_details uses.
 -- RESTRICT, not CASCADE: deleting a place entity must not quietly empty the guides that
 -- point at it.
 place_snapshot jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(place_snapshot)='object'),
 location_entity_id uuid REFERENCES public.entities(id) ON DELETE RESTRICT,
 CHECK(pg_catalog.octet_length(place_snapshot::text)+pg_catalog.octet_length(coalesce(tips_notes,'null')::text)<=65536),
 UNIQUE(collection_id,account_id),
 FOREIGN KEY(collection_id,account_id,category) REFERENCES public.collections(id,account_id,category) ON DELETE CASCADE
);
CREATE INDEX guide_collection_details_account_idx ON public.guide_collection_details(account_id,collection_id);
CREATE INDEX guide_collection_details_entity_idx ON public.guide_collection_details(location_entity_id) WHERE location_entity_id IS NOT NULL;

CREATE TABLE public.guide_sections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 collection_id uuid NOT NULL,
 account_id uuid NOT NULL,
 category text NOT NULL DEFAULT 'guides' CHECK(category='guides'),
 display_order integer NOT NULL CHECK(display_order BETWEEN 0 AND 199),
 -- The block schema version travels with the row. A section written by a newer schema is
 -- refused on read rather than being parsed as a partially-understood object, which is how
 -- a half-recognised block becomes silent data loss on the next save.
 block_version text NOT NULL CHECK(block_version='guide-section-blocks/v1'),
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 200),
 description text CHECK(description IS NULL OR length(description)<=20000),
 blocks jsonb NOT NULL CHECK(jsonb_typeof(blocks)='object' AND pg_catalog.octet_length(blocks::text)<=262144),
 archived_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,account_id),UNIQUE(id,collection_id),UNIQUE(id,collection_id,account_id),
 -- Deferred, so one transaction renumbers [S1,S2] to [S2,S1] without ever being rejected
 -- for a duplicate it is halfway through resolving. This is the same device
 -- collection_items uses for recommendation order.
 UNIQUE(collection_id,display_order) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(collection_id,account_id,category) REFERENCES public.collections(id,account_id,category) ON DELETE CASCADE
);
CREATE INDEX guide_sections_order_idx ON public.guide_sections(collection_id,display_order,id) WHERE archived_at IS NULL;
CREATE INDEX guide_sections_account_idx ON public.guide_sections(account_id,collection_id);

-- Photo ids are carried inside the section's block JSON, where the itinerary layout needs
-- them: which photos belong to which stop, in the author's order. JSON cannot hold a
-- foreign key, so without this table a media asset could be deleted out from under a
-- published guide and account deletion would not see the reference at all.
--
-- So the JSON keeps the layout and this table keeps the integrity: one row per referenced
-- asset, with the same RESTRICT and the same purpose/status guard every other owned image
-- gets. A deferred constraint trigger (below) asserts the two agree exactly, because two
-- records of the same fact drift the moment nothing checks them.
CREATE TABLE public.guide_section_photos (
 section_id uuid NOT NULL,
 account_id uuid NOT NULL,
 media_id uuid NOT NULL,
 PRIMARY KEY(section_id,media_id),
 FOREIGN KEY(section_id,account_id) REFERENCES public.guide_sections(id,account_id) ON DELETE CASCADE,
 FOREIGN KEY(media_id,account_id) REFERENCES public.media_assets(id,account_id) ON DELETE RESTRICT
);
CREATE INDEX guide_section_photos_asset_idx ON public.guide_section_photos(media_id,account_id);
CREATE INDEX guide_section_photos_account_idx ON public.guide_section_photos(account_id,section_id);

REVOKE ALL ON public.guide_collection_details FROM PUBLIC,music_runtime;
REVOKE ALL ON public.guide_sections FROM PUBLIC,music_runtime;
REVOKE ALL ON public.guide_section_photos FROM PUBLIC,music_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.guide_collection_details TO music_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.guide_sections TO music_runtime;
GRANT SELECT,INSERT,DELETE ON public.guide_section_photos TO music_runtime;

-- A guide's parent must be a guide, a section's media must stay a ready owned image, and
-- the block JSON's photo ids must equal this section's registry rows. The last of those
-- needs a set comparison, so it cannot be a CHECK: PostgreSQL rejects subqueries in CHECK
-- with 0A000. It is deferred to the end of the transaction so that writing a section and
-- registering its photos in either order both succeed.
CREATE FUNCTION public.guard_guide_section_media() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE declared uuid[]; registered uuid[]; target uuid;
BEGIN
 IF TG_TABLE_NAME='media_assets' THEN
  -- purpose='guide' exactly. 0024 has always admitted this purpose and nothing could set
  -- it; 5.3 opens it in the upload allowlist. Pinning it here keeps a section photo and a
  -- list cover distinguishable, so neither can be attached where the other belongs.
  IF EXISTS(SELECT 1 FROM public.guide_section_photos WHERE media_id=NEW.id) AND NOT EXISTS(
   SELECT 1 FROM public.media_assets WHERE id=NEW.id AND status='ready' AND purpose='guide'
     AND mime_type IN ('image/png','image/jpeg','image/gif','image/webp') AND byte_size BETWEEN 1 AND 5242880)
  THEN RAISE EXCEPTION 'Guide section photo media must remain a ready owned guide image' USING ERRCODE='23514'; END IF;
  RETURN NULL;
 ELSIF TG_TABLE_NAME='guide_sections' THEN
  target:=NEW.id;
 ELSIF TG_OP='DELETE' THEN
  target:=OLD.section_id;
 ELSE
  target:=NEW.section_id;
  -- A newly registered photo must be a ready owned guide image of this same account. FOR
  -- SHARE locks the asset row, so a concurrent purpose change serialises against this
  -- check rather than racing past it.
  PERFORM 1 FROM public.media_assets WHERE id=NEW.media_id AND account_id=NEW.account_id
    AND status='ready' AND purpose='guide' AND mime_type IN ('image/png','image/jpeg','image/gif','image/webp')
    AND byte_size BETWEEN 1 AND 5242880 FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Guide section photo requires a ready owned guide image' USING ERRCODE='23514'; END IF;
 END IF;
 -- The section may have been deleted later in this transaction; nothing left to reconcile.
 IF NOT EXISTS(SELECT 1 FROM public.guide_sections WHERE id=target) THEN RETURN NULL; END IF;
 -- Recursive descent finds every photos array in the blocks, wherever a future block puts
 -- one, so a new block type cannot quietly escape the registry.
 SELECT coalesce(array_agg(DISTINCT photo::uuid ORDER BY photo::uuid),'{}') INTO declared
  FROM public.guide_sections s
  CROSS JOIN LATERAL jsonb_array_elements_text(pg_catalog.jsonb_path_query_array(s.blocks,'$.**.photos[*].mediaId')) AS photo
  WHERE s.id=target;
 SELECT coalesce(array_agg(DISTINCT media_id ORDER BY media_id),'{}') INTO registered
  FROM public.guide_section_photos WHERE section_id=target;
 IF declared IS DISTINCT FROM registered THEN
  RAISE EXCEPTION 'Guide section photo registry must match the block JSON' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER guide_section_media_registry AFTER INSERT OR UPDATE OF blocks ON public.guide_sections
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_guide_section_media();
CREATE CONSTRAINT TRIGGER guide_section_photo_registry AFTER INSERT OR DELETE ON public.guide_section_photos
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_guide_section_media();
CREATE CONSTRAINT TRIGGER guide_section_photo_asset_guard AFTER UPDATE OF status,purpose,mime_type,byte_size ON public.media_assets
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_guide_section_media();

-- There is deliberately NO trigger guarding "a collection with sections must remain a
-- guide". Both child tables carry a composite FK to collections(id,account_id,category),
-- and that FK is NOT DEFERRABLE with NO ACTION on update, so any attempt to change the
-- parent's category is refused immediately by the FK itself - verified against PostgreSQL
-- 15: condeferrable='f', confupdtype='a'. A trigger for it would be unreachable, and an
-- unreachable guard is worse than none, because it claims a protection it never performs
-- and no test can ever exercise it.

-- The guide's location entity must stay a place, exactly as a Places list's does.
CREATE FUNCTION public.guard_guide_location_entity() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.kind<>'place' AND EXISTS(SELECT 1 FROM public.guide_collection_details WHERE location_entity_id=NEW.id)
 THEN RAISE EXCEPTION 'Guide location entity must remain a place' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER guide_location_entity_guard AFTER UPDATE OF kind ON public.entities
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_guide_location_entity();

REVOKE ALL ON FUNCTION public.guard_guide_section_media() FROM PUBLIC,music_runtime;

REVOKE ALL ON FUNCTION public.guard_guide_location_entity() FROM PUBLIC,music_runtime;

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
  INSERT INTO public.account_category_content_state(account_id,category,revision)
   VALUES(scope.account_id,scope.category,1)
   ON CONFLICT(account_id,category) DO UPDATE SET revision=public.account_category_content_state.revision+1;
 END LOOP;
 RETURN NULL;
END $$;

CREATE TRIGGER guide_collection_details_content_revision_insert AFTER INSERT ON public.guide_collection_details REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.explorers_content_revision_insert();
CREATE TRIGGER guide_collection_details_content_revision_update AFTER UPDATE ON public.guide_collection_details REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.explorers_content_revision_update();
CREATE TRIGGER guide_collection_details_content_revision_delete AFTER DELETE ON public.guide_collection_details REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.explorers_content_revision_delete();
CREATE TRIGGER guide_sections_content_revision_insert AFTER INSERT ON public.guide_sections REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.explorers_content_revision_insert();
CREATE TRIGGER guide_sections_content_revision_update AFTER UPDATE ON public.guide_sections REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.explorers_content_revision_update();
CREATE TRIGGER guide_sections_content_revision_delete AFTER DELETE ON public.guide_sections REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.explorers_content_revision_delete();
CREATE TRIGGER guide_section_photos_content_revision_insert AFTER INSERT ON public.guide_section_photos REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.explorers_content_revision_insert();
CREATE TRIGGER guide_section_photos_content_revision_delete AFTER DELETE ON public.guide_section_photos REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.explorers_content_revision_delete();

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
 -- Section photos release their RESTRICT on media_assets before the sections go, so a
 -- guide with imagery does not block its own account's deletion. The collections DELETE
 -- below cascades to both guide tables; these are explicit for the same reason the place
 -- photo deletes are - the order is the part that matters, not the cascade.
 DELETE FROM public.guide_section_photos WHERE account_id=target_account;
 DELETE FROM public.guide_sections WHERE account_id=target_account;
 DELETE FROM public.guide_collection_details WHERE account_id=target_account;
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
