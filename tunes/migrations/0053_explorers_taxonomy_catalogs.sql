-- T1 storage only. Trusted global import entry MUST lock taxonomy_terms in
-- SHARE ROW EXCLUSIVE mode BEFORE catalog serialization, then lock sorted
-- affected account/category scopes and recommendations before any DML.
-- Existing 0037 taxonomy_tree_lock remains unchanged. Direct administrative DML
-- is unsupported concurrent import entry: a late row trigger cannot establish
-- the pre-DML table lock order. Future importer and PostgreSQL qualification
-- must demonstrate this protocol; these declarations do not qualify a race.
-- Assignment commands MUST acquire the catalog lock before account/category
-- and recommendation locks. The association trigger is a safety backstop,
-- not proof that application locks acquired before DML follow that protocol.
LOCK TABLE public.taxonomy_terms IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE public.taxonomy_catalogs (
 category text PRIMARY KEY CHECK(category IN ('places','people')),
 state text NOT NULL DEFAULT 'UNCONFIGURED' CHECK(state IN ('UNCONFIGURED','CONFIGURED')),
 version bigint NOT NULL DEFAULT 0 CHECK(version BETWEEN 0 AND 9007199254740991),
 default_locale text CHECK(default_locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
 CHECK((state='UNCONFIGURED' AND version=0 AND default_locale IS NULL)
    OR (state='CONFIGURED' AND version>0 AND default_locale IS NOT NULL))
);
INSERT INTO public.taxonomy_catalogs(category) VALUES ('places'),('people');
CREATE TABLE public.taxonomy_source_mappings (
 category text NOT NULL REFERENCES public.taxonomy_catalogs(category) ON DELETE RESTRICT,
 source_host text NOT NULL CHECK(length(source_host) BETWEEN 1 AND 253 AND source_host ~ '^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'),
 entity_kind text NOT NULL CHECK(length(entity_kind) BETWEEN 1 AND 200 AND length(btrim(entity_kind))>0 AND entity_kind !~ '[[:cntrl:]]'),
 document_id text NOT NULL CHECK(length(document_id) BETWEEN 1 AND 500 AND length(btrim(document_id))>0 AND document_id !~ '[[:cntrl:]]'),
 term_id uuid NOT NULL,
 PRIMARY KEY(category,source_host,entity_kind,document_id),
 FOREIGN KEY(term_id,category) REFERENCES public.taxonomy_terms(id,category) ON DELETE RESTRICT
);
CREATE TABLE public.taxonomy_legacy_slug_mappings (
 category text NOT NULL REFERENCES public.taxonomy_catalogs(category) ON DELETE RESTRICT,
 legacy_slug text NOT NULL CHECK(length(legacy_slug) BETWEEN 1 AND 100 AND legacy_slug=btrim(legacy_slug) AND legacy_slug !~ '[/?#[:space:][:cntrl:]]'),
 term_id uuid NOT NULL,PRIMARY KEY(category,legacy_slug),
 FOREIGN KEY(term_id,category) REFERENCES public.taxonomy_terms(id,category) ON DELETE RESTRICT
);
CREATE TABLE public.taxonomy_import_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 category text NOT NULL REFERENCES public.taxonomy_catalogs(category) ON DELETE RESTRICT,
 import_contract text NOT NULL CHECK(import_contract='explorers-taxonomy-import/v1'),
 input_hash text NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'),
 catalog_version bigint NOT NULL CHECK(catalog_version BETWEEN 1 AND 9007199254740991),
 changed boolean NOT NULL,
 reviewed_by text NOT NULL CHECK(length(reviewed_by) BETWEEN 1 AND 200 AND length(btrim(reviewed_by))>0),
 receipt jsonb NOT NULL CHECK(jsonb_typeof(receipt)='object'),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX taxonomy_source_mappings_term_idx ON public.taxonomy_source_mappings(term_id,category);
CREATE INDEX taxonomy_legacy_slug_mappings_term_idx ON public.taxonomy_legacy_slug_mappings(term_id,category);
CREATE INDEX taxonomy_import_receipts_category_idx ON public.taxonomy_import_receipts(category,created_at,id);

-- Trusted importer entry and runtime assignment entry share this category row
-- mutex. No table mutation grant is needed to call the narrowly scoped helper.
CREATE FUNCTION public.lock_explorers_taxonomy_catalog(target_category text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF target_category NOT IN ('places','people') OR target_category IS NULL THEN
  RAISE EXCEPTION 'Unsupported taxonomy catalog' USING ERRCODE='23514';
 END IF;
 PERFORM category FROM public.taxonomy_catalogs WHERE category=target_category FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Missing taxonomy catalog' USING ERRCODE='23514'; END IF;
END $$;
CREATE FUNCTION public.lock_recommendation_taxonomy_catalog() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE target_category text;
BEGIN
 target_category:=CASE WHEN TG_OP='DELETE' THEN OLD.category ELSE NEW.category END;
 IF TG_OP='UPDATE' AND NEW.category IS DISTINCT FROM OLD.category THEN
  RAISE EXCEPTION 'Taxonomy association parent is immutable' USING ERRCODE='23514';
 END IF;
 IF target_category IN ('places','people') THEN
  PERFORM public.lock_explorers_taxonomy_catalog(target_category);
  IF TG_OP<>'DELETE' THEN
   IF NOT EXISTS(SELECT 1 FROM public.taxonomy_catalogs WHERE category=target_category AND state='CONFIGURED')
     OR NOT EXISTS(SELECT 1 FROM public.taxonomy_terms term
       LEFT JOIN public.taxonomy_terms ancestor ON ancestor.id=term.parent_id
       WHERE term.id=NEW.term_id AND term.category=target_category AND term.active
        AND (term.parent_id IS NULL OR (ancestor.active AND ancestor.category=target_category AND ancestor.parent_id IS NULL))) THEN
    RAISE EXCEPTION 'Unavailable taxonomy assignment' USING ERRCODE='23514';
   END IF;
  END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
-- Alphabetical BEFORE-row ordering precedes recommendation_taxonomy_parent_lock.
CREATE TRIGGER recommendation_taxonomy_catalog_lock BEFORE INSERT OR UPDATE OR DELETE ON public.recommendation_taxonomy FOR EACH ROW EXECUTE FUNCTION public.lock_recommendation_taxonomy_catalog();

CREATE FUNCTION public.validate_explorers_taxonomy_catalogs() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF (SELECT count(*) FROM public.taxonomy_catalogs)<>2 THEN
  RAISE EXCEPTION 'Missing taxonomy catalog' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM public.taxonomy_terms child
  LEFT JOIN public.taxonomy_terms parent ON parent.id=child.parent_id
  WHERE child.category IN ('places','people') AND child.parent_id IS NOT NULL
   AND (child.category='people' OR parent.id IS NULL OR parent.category<>child.category OR parent.parent_id IS NOT NULL)) THEN
  RAISE EXCEPTION 'Unsupported taxonomy hierarchy' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM public.recommendation_taxonomy assignment
  JOIN public.taxonomy_terms term ON term.id=assignment.term_id
  WHERE (assignment.category='people' AND (assignment.position<>0 OR term.parent_id IS NOT NULL))
   OR (assignment.category='places' AND
      (assignment.position NOT IN (0,1) OR (assignment.position=0 AND term.parent_id IS NOT NULL)
       OR (assignment.position=1 AND NOT EXISTS(
        SELECT 1 FROM public.recommendation_taxonomy root
        JOIN public.taxonomy_terms root_term ON root_term.id=root.term_id
        JOIN public.recommendation_taxonomy child ON child.recommendation_id=root.recommendation_id
        JOIN public.taxonomy_terms child_term ON child_term.id=child.term_id
        WHERE root.recommendation_id=assignment.recommendation_id AND root.category='places'
         AND root.position=0 AND root_term.parent_id IS NULL AND child.position=1
         AND child.term_id=assignment.term_id AND child_term.parent_id=root.term_id))))) THEN
  RAISE EXCEPTION 'Invalid Places or People taxonomy assignment shape' USING ERRCODE='23514';
 END IF;
 -- Existing generic deferred uniqueness/contiguity checks remain authoritative.
 -- Active state is deliberately not checked here: deactivation retains existing
 -- assignments as unavailable; only fresh INSERT/UPDATE must pass availability.
 IF EXISTS(SELECT 1 FROM public.taxonomy_catalogs catalog
  JOIN public.taxonomy_terms term ON term.category=catalog.category
  WHERE catalog.state='CONFIGURED' AND NOT EXISTS(
   SELECT 1 FROM public.taxonomy_term_translations label
   WHERE label.term_id=term.id AND label.locale=catalog.default_locale
    AND length(btrim(label.label))>0 AND label.label !~ '[[:cntrl:]]')) THEN
  RAISE EXCEPTION 'Missing approved default label' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM public.taxonomy_legacy_slug_mappings mapping
  JOIN public.taxonomy_terms term ON term.category=mapping.category AND term.slug=mapping.legacy_slug
  WHERE term.id<>mapping.term_id) THEN
  RAISE EXCEPTION 'Legacy mapping conflicts with canonical slug' USING ERRCODE='23514';
 END IF;
END $$;
CREATE FUNCTION public.guard_explorers_taxonomy_catalogs() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN PERFORM public.validate_explorers_taxonomy_catalogs(); RETURN NULL; END $$;
CREATE CONSTRAINT TRIGGER explorers_taxonomy_terms_shape AFTER INSERT OR UPDATE OR DELETE ON public.taxonomy_terms DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_explorers_taxonomy_catalogs();
CREATE CONSTRAINT TRIGGER explorers_taxonomy_assignments_shape AFTER INSERT OR UPDATE OR DELETE ON public.recommendation_taxonomy DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_explorers_taxonomy_catalogs();
CREATE CONSTRAINT TRIGGER explorers_taxonomy_catalog_labels AFTER INSERT OR UPDATE OR DELETE ON public.taxonomy_catalogs DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_explorers_taxonomy_catalogs();
CREATE CONSTRAINT TRIGGER explorers_taxonomy_translation_labels AFTER INSERT OR UPDATE OR DELETE ON public.taxonomy_term_translations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_explorers_taxonomy_catalogs();
CREATE CONSTRAINT TRIGGER explorers_taxonomy_legacy_routes AFTER INSERT OR UPDATE OR DELETE ON public.taxonomy_legacy_slug_mappings DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_explorers_taxonomy_catalogs();
CREATE FUNCTION public.guard_taxonomy_import_receipt_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'Taxonomy import receipt is immutable' USING ERRCODE='23514'; END $$;
CREATE TRIGGER taxonomy_import_receipt_immutable BEFORE UPDATE OR DELETE ON public.taxonomy_import_receipts FOR EACH ROW EXECUTE FUNCTION public.guard_taxonomy_import_receipt_immutable();
-- Fail migration on incompatible pre-existing Places/People data; never repair,
-- silently remap or delete assignments. No vocabulary is supplied by this file.
SELECT public.validate_explorers_taxonomy_catalogs();
REVOKE ALL ON public.taxonomy_catalogs,public.taxonomy_source_mappings,public.taxonomy_legacy_slug_mappings,public.taxonomy_import_receipts FROM PUBLIC,music_runtime;
GRANT SELECT ON public.taxonomy_catalogs,public.taxonomy_source_mappings,public.taxonomy_legacy_slug_mappings TO music_runtime;
REVOKE ALL ON FUNCTION public.lock_explorers_taxonomy_catalog(text),public.lock_recommendation_taxonomy_catalog(),public.validate_explorers_taxonomy_catalogs(),public.guard_explorers_taxonomy_catalogs(),public.guard_taxonomy_import_receipt_immutable() FROM PUBLIC,music_runtime;
GRANT EXECUTE ON FUNCTION public.lock_explorers_taxonomy_catalog(text) TO music_runtime;
