-- Products: catalog facts on the shared entity, the creator's offer per recommendation.
-- Ticket 4.4.
--
-- price/currency_code/buy_url live in product_recommendation_context, not on the entity,
-- because they are one creator's recorded offer rather than a universal catalog fact.
-- That is what makes "A's changed recorded offer must not change B's recommendation of
-- the same entity" true by construction instead of by convention.
--
-- numeric(20,6) with a >= 0 CHECK, never a float. Zero is a real price, NULL is unknown,
-- and the two must stay distinguishable through storage, the wire and the adapter. Six
-- minor digits is headroom for the column, not a claim that any currency has six; the
-- contract validates scale against the supported currency's own minor units.
--
-- currency_code is nullable independently of price: an amount with an unknown currency is
-- a legitimate state and there is no implicit USD. The display formatter's USD fallback
-- is presentation only and is deliberately left alone - this migration refuses to store
-- the fallback as a fact.
--
-- specifications is a string->string jsonb object, bounded at 200 entries, enforced here
-- as well as in the contract. image_urls are approved external provider URLs with scheme
-- CHECKs; owner uploads continue to travel through the core media relation rather than
-- being embedded here as URLs.
LOCK TABLE public.creator_accounts IN EXCLUSIVE MODE;
LOCK TABLE public.entities,public.recommendations IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE public.product_entity_details (
 entity_id uuid PRIMARY KEY REFERENCES public.entities(id) ON DELETE CASCADE,
 product_url text NOT NULL CHECK(product_url ~ '^https?://' AND length(product_url) BETWEEN 8 AND 2048),
 brand text CHECK(brand IS NULL OR length(brand) BETWEEN 1 AND 200),
 logo_url text CHECK(logo_url IS NULL OR (logo_url ~ '^https?://' AND length(logo_url) BETWEEN 8 AND 2048)),
 description text CHECK(description IS NULL OR length(description) BETWEEN 1 AND 8192),
 -- A CHECK cannot contain a subquery (0A000), so the per-element rules - every
 -- specification value a bounded string, every image URL an http(s) address - are
 -- enforced by the constraint trigger below. Only the scalar bounds live here.
 specifications jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(specifications)='object'),
 image_urls text[] NOT NULL DEFAULT '{}' CHECK(array_length(image_urls,1) IS NULL OR array_length(image_urls,1)<=20)
);

CREATE TABLE public.product_recommendation_context (
 recommendation_id uuid PRIMARY KEY,account_id uuid NOT NULL,
 category text NOT NULL DEFAULT 'products' CHECK(category='products'),
 price numeric(20,6) CHECK(price IS NULL OR price>=0),
 currency_code text CHECK(currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$'),
 buy_url text CHECK(buy_url IS NULL OR (buy_url ~ '^https?://' AND length(buy_url) BETWEEN 8 AND 2048)),
 UNIQUE(recommendation_id,account_id),
 FOREIGN KEY(recommendation_id,account_id,category) REFERENCES public.recommendations(id,account_id,category) ON DELETE CASCADE
);
CREATE INDEX product_recommendation_context_price_idx ON public.product_recommendation_context(account_id,price,recommendation_id) WHERE price IS NOT NULL;

CREATE FUNCTION public.guard_product_entity_details() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_TABLE_NAME='entities' THEN
  IF NEW.kind<>'product' AND EXISTS(SELECT 1 FROM public.product_entity_details WHERE entity_id=NEW.id) THEN RAISE EXCEPTION 'Product detail kind mismatch' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.entities WHERE id=NEW.entity_id AND kind='product') THEN RAISE EXCEPTION 'Product detail kind mismatch' USING ERRCODE='23514'; END IF;
 -- Specifications are a bounded string->string map. A jsonb object can hold arrays,
 -- numbers and nested objects, so the value type is checked rather than assumed.
 IF (SELECT count(*) FROM jsonb_object_keys(NEW.specifications))>200 THEN RAISE EXCEPTION 'Product specifications exceed 200 entries' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(NEW.specifications) entry
   WHERE jsonb_typeof(entry.value)<>'string' OR length(entry.key) NOT BETWEEN 1 AND 200 OR length(entry.value #>> '{}') NOT BETWEEN 1 AND 2000)
 THEN RAISE EXCEPTION 'Product specifications must be bounded text pairs' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(NEW.image_urls) url WHERE url !~ '^https?://' OR length(url) NOT BETWEEN 8 AND 2048)
 THEN RAISE EXCEPTION 'Product image URL must be a bounded http(s) address' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER product_entity_details_kind_guard AFTER INSERT OR UPDATE ON public.product_entity_details DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_product_entity_details();
CREATE CONSTRAINT TRIGGER entities_product_details_kind_guard AFTER UPDATE ON public.entities DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_product_entity_details();

REVOKE ALL ON public.product_entity_details,public.product_recommendation_context FROM PUBLIC,music_runtime;
GRANT SELECT,INSERT ON public.product_entity_details TO music_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.product_recommendation_context TO music_runtime;
REVOKE ALL ON FUNCTION public.guard_product_entity_details() FROM PUBLIC,music_runtime;

CREATE TRIGGER product_recommendation_context_content_revision_insert AFTER INSERT ON public.product_recommendation_context REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.explorers_content_revision_insert();
CREATE TRIGGER product_recommendation_context_content_revision_update AFTER UPDATE ON public.product_recommendation_context REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.explorers_content_revision_update();
CREATE TRIGGER product_recommendation_context_content_revision_delete AFTER DELETE ON public.product_recommendation_context REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.explorers_content_revision_delete();

-- Re-declared from the 0043 bodies with product_recommendation_context added, generated
-- rather than retyped.

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
