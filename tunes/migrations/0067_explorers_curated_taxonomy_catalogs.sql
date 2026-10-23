-- 0067 (DS-07): curated taxonomy catalogs for Movies, Books, Games, Apps and Products.
-- Books, Games, Apps and Products are FLAT reviewed catalogs: one term per recommendation
-- (position 0, no parent), applied later by apply-reviewed-taxonomy --category <c> with an
-- immutable receipt, exactly like People. They start UNCONFIGURED, so nothing can be
-- assigned until the reviewed apply runs.
-- Movies keeps the 27 TMDB-mapped terms 0037 seeded. Those rows have random ids that no
-- reviewed receipt reserves, so the importer could never adopt them; the catalog is marked
-- CONFIGURED in place (every term already has an 'en' label) and movies is never imported.
-- Movies assignment writes (writeMovieTerms) keep their existing lock order: movies is NOT
-- added to the row-trigger catalog lock below.
-- The three functions are the 0053 bodies (no later migration redefined them) with only the
-- category sets widened and the flat-hierarchy rule generalised from people to every
-- non-places catalog. Signatures are unchanged, so the runtime function inventory is too.
LOCK TABLE public.taxonomy_terms IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.taxonomy_catalogs,public.recommendation_taxonomy IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.taxonomy_catalogs DROP CONSTRAINT taxonomy_catalogs_category_check;
ALTER TABLE public.taxonomy_catalogs ADD CONSTRAINT taxonomy_catalogs_category_check
 CHECK(category IN ('places','people','movies','books','games','apps','products'));
INSERT INTO public.taxonomy_catalogs(category) VALUES ('books'),('games'),('apps'),('products');
INSERT INTO public.taxonomy_catalogs(category,state,version,default_locale) VALUES ('movies','CONFIGURED',1,'en');

CREATE OR REPLACE FUNCTION public.lock_explorers_taxonomy_catalog(target_category text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF target_category NOT IN ('places','people','movies','books','games','apps','products') OR target_category IS NULL THEN
  RAISE EXCEPTION 'Unsupported taxonomy catalog' USING ERRCODE='23514';
 END IF;
 PERFORM category FROM public.taxonomy_catalogs WHERE category=target_category FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Missing taxonomy catalog' USING ERRCODE='23514'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.lock_recommendation_taxonomy_catalog() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE target_category text;
BEGIN
 target_category:=CASE WHEN TG_OP='DELETE' THEN OLD.category ELSE NEW.category END;
 IF TG_OP='UPDATE' AND NEW.category IS DISTINCT FROM OLD.category THEN
  RAISE EXCEPTION 'Taxonomy association parent is immutable' USING ERRCODE='23514';
 END IF;
 IF target_category IN ('places','people','books','games','apps','products') THEN
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

CREATE OR REPLACE FUNCTION public.validate_explorers_taxonomy_catalogs() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF (SELECT count(*) FROM public.taxonomy_catalogs)<>7 THEN
  RAISE EXCEPTION 'Missing taxonomy catalog' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM public.taxonomy_terms child
  LEFT JOIN public.taxonomy_terms parent ON parent.id=child.parent_id
  WHERE child.category IN ('places','people','movies','books','games','apps','products') AND child.parent_id IS NOT NULL
   AND (child.category<>'places' OR parent.id IS NULL OR parent.category<>child.category OR parent.parent_id IS NOT NULL)) THEN
  RAISE EXCEPTION 'Unsupported taxonomy hierarchy' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM public.recommendation_taxonomy assignment
  JOIN public.taxonomy_terms term ON term.id=assignment.term_id
  WHERE (assignment.category IN ('people','books','games','apps','products') AND (assignment.position<>0 OR term.parent_id IS NOT NULL))
   OR (assignment.category='movies' AND term.parent_id IS NOT NULL)
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

-- Fail the migration on incompatible existing data rather than repairing it.
SELECT public.validate_explorers_taxonomy_catalogs();
REVOKE ALL ON FUNCTION public.lock_explorers_taxonomy_catalog(text),public.lock_recommendation_taxonomy_catalog(),public.validate_explorers_taxonomy_catalogs() FROM PUBLIC,music_runtime;
GRANT EXECUTE ON FUNCTION public.lock_explorers_taxonomy_catalog(text) TO music_runtime;
