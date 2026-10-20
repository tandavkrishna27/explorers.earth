-- Two unrelated, non-destructive changes shipped together so the launch needs one migration.
--
-- 1. Product specifications keep the order the owner typed them in.
--
--    specifications was a jsonb OBJECT, and jsonb does not preserve key order (it stores keys
--    by length, then bytes), so an owner's order was lost the moment it was saved. The column
--    now also holds an ordered ARRAY of {"key":..., "value":...}. Both shapes are accepted:
--    existing rows stay objects and are read in the order they have always been shown, and a
--    previous release that still writes an object during a blue/green overlap keeps working.
--    New writes are arrays. The per-element rules the 0044 trigger enforced for the object
--    (200 entries, bounded non-empty text, string values) are enforced for the array too, with
--    keys additionally unique.
--
-- 2. A guide's estimated budget fits three-decimal currencies.
--
--    numeric(14,2) cannot store KWD, BHD or OMR amounts exactly. numeric(14,3) holds every
--    existing value unchanged (a wider scale only adds a trailing zero), keeps the CHECKs
--    that reference the column, and is a rewrite of a small table, not a data change.
LOCK TABLE public.product_entity_details,public.guide_collection_details IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.product_entity_details DROP CONSTRAINT product_entity_details_specifications_check;
ALTER TABLE public.product_entity_details
 ADD CONSTRAINT product_entity_details_specifications_check CHECK(jsonb_typeof(specifications) IN ('object','array'));
ALTER TABLE public.product_entity_details ALTER COLUMN specifications SET DEFAULT '[]';

CREATE OR REPLACE FUNCTION public.guard_product_entity_details() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_TABLE_NAME='entities' THEN
  IF NEW.kind<>'product' AND EXISTS(SELECT 1 FROM public.product_entity_details WHERE entity_id=NEW.id) THEN RAISE EXCEPTION 'Product detail kind mismatch' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.entities WHERE id=NEW.entity_id AND kind='product') THEN RAISE EXCEPTION 'Product detail kind mismatch' USING ERRCODE='23514'; END IF;
 IF jsonb_typeof(NEW.specifications)='object' THEN
  -- Legacy shape: a bounded string->string map.
  IF (SELECT count(*) FROM jsonb_object_keys(NEW.specifications))>200 THEN RAISE EXCEPTION 'Product specifications exceed 200 entries' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_each(NEW.specifications) entry
    WHERE jsonb_typeof(entry.value)<>'string' OR length(entry.key) NOT BETWEEN 1 AND 200 OR length(entry.value #>> '{}') NOT BETWEEN 1 AND 2000)
  THEN RAISE EXCEPTION 'Product specifications must be bounded text pairs' USING ERRCODE='23514'; END IF;
 ELSE
  -- Ordered shape: an array of exactly {key,value} text pairs, keys unique.
  IF jsonb_array_length(NEW.specifications)>200 THEN RAISE EXCEPTION 'Product specifications exceed 200 entries' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.specifications) entry
    WHERE jsonb_typeof(entry)<>'object'
       OR (SELECT count(*) FROM jsonb_object_keys(entry))<>2 OR NOT (entry ? 'key') OR NOT (entry ? 'value')
       OR jsonb_typeof(entry->'key')<>'string' OR jsonb_typeof(entry->'value')<>'string'
       OR length(entry->>'key') NOT BETWEEN 1 AND 200 OR length(entry->>'value') NOT BETWEEN 1 AND 2000)
  THEN RAISE EXCEPTION 'Product specifications must be bounded text pairs' USING ERRCODE='23514'; END IF;
  IF (SELECT count(DISTINCT entry->>'key') FROM jsonb_array_elements(NEW.specifications) entry)<>jsonb_array_length(NEW.specifications)
  THEN RAISE EXCEPTION 'Product specification keys must be unique' USING ERRCODE='23514'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM unnest(NEW.image_urls) url WHERE url !~ '^https?://' OR length(url) NOT BETWEEN 8 AND 2048)
 THEN RAISE EXCEPTION 'Product image URL must be a bounded http(s) address' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_product_entity_details() FROM PUBLIC,music_runtime;

ALTER TABLE public.guide_collection_details ALTER COLUMN estimated_budget TYPE numeric(14,3);
