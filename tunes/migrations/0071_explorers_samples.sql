-- SMP-08. First-visit samples are the account's own lists, flagged. Two rules are storage:
--  - a sample is never public: the CHECKs refuse any publish path that forgets to ask;
--  - a seeded key is never seeded again: the receipt row is permanent (no DELETE grant),
--    and survives the list being deleted (collection_id becomes NULL) or made mine (claimed_at).
LOCK TABLE public.creator_accounts IN EXCLUSIVE MODE;
LOCK TABLE public.collections,public.recommendations IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.collections ADD COLUMN is_sample boolean NOT NULL DEFAULT false;
ALTER TABLE public.collections ADD CONSTRAINT collections_sample_never_public
 CHECK(NOT is_sample OR (visibility='private' AND publication_state='draft'));
ALTER TABLE public.recommendations ADD COLUMN is_sample boolean NOT NULL DEFAULT false;
ALTER TABLE public.recommendations ADD CONSTRAINT recommendations_sample_never_published
 CHECK(NOT is_sample OR publication_state='draft');
CREATE INDEX collections_account_sample_idx ON public.collections(account_id,category) WHERE is_sample AND archived_at IS NULL;

CREATE TABLE public.sample_seeding_receipts (
 account_id uuid NOT NULL REFERENCES public.creator_accounts(id) ON DELETE CASCADE,
 sample_key text NOT NULL CHECK(length(sample_key) BETWEEN 3 AND 120 AND sample_key ~ '^[a-z]+/[a-z0-9]+(-[a-z0-9]+)*$'),
 category text NOT NULL CHECK(category IN ('places','guides','movies','books','games','apps','products','people')),
 fixture_set text NOT NULL CHECK(fixture_set IN ('india','global')),
 fixture_version text NOT NULL CHECK(fixture_version ~ '^v[0-9]{1,4}$'),
 collection_id uuid REFERENCES public.collections(id) ON DELETE SET NULL,
 seeded_at timestamptz NOT NULL DEFAULT now(),
 claimed_at timestamptz,
 PRIMARY KEY(account_id,sample_key),
 CHECK(split_part(sample_key,'/',1)=category)
);
CREATE INDEX sample_seeding_receipts_collection_idx ON public.sample_seeding_receipts(collection_id) WHERE collection_id IS NOT NULL;
REVOKE ALL ON public.sample_seeding_receipts FROM PUBLIC,music_runtime;
GRANT SELECT,INSERT,UPDATE ON public.sample_seeding_receipts TO music_runtime;

-- Re-declared verbatim from the 0056 body with the receipts delete added before the
-- collections delete (receipts are not content: no revision triggers).
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
 -- BEGIN Apps enrichment owner provenance (migration 0055).
 -- Ordered inner-to-outer against the ON DELETE RESTRICT chain
 -- acceptances -> entitlements -> generations -> bindings, with the binding's current
 -- pointer cleared BEFORE the generations it names are removed (the current-generation FK
 -- is DEFERRABLE INITIALLY DEFERRED and its deferred constraint trigger passes on a NULL
 -- pointer and on an already-deleted binding). Every statement is account-scoped, so
 -- ANOTHER owner's bindings, generations, entitlements and acceptances are untouched, and
 -- app_enrichment_snapshots is deliberately NOT deleted here: a snapshot is ownerless
 -- shared content, deleting it would destroy other owners' entitlements, and shared
 -- snapshot GC is separately approved policy that this migration does not install.
 -- This block runs BEFORE the recommendations delete below because every binding holds a
 -- RESTRICT reference to recommendations(id,account_id,category).
 DELETE FROM public.app_enrichment_acceptances WHERE account_id=target_account;
 DELETE FROM public.app_enrichment_entitlements WHERE account_id=target_account;
 -- Durable candidate provenance holds restrictive generation/owner references.
 DELETE FROM public.app_enrichment_job_candidates WHERE account_id=target_account;
 UPDATE public.app_enrichment_bindings SET current_generation_id=NULL
   WHERE account_id=target_account AND current_generation_id IS NOT NULL;
 DELETE FROM public.app_enrichment_generation_retirements WHERE generation_id IN
   (SELECT id FROM public.app_enrichment_generations WHERE account_id=target_account);
 DELETE FROM public.app_enrichment_generations WHERE account_id=target_account;
 DELETE FROM public.app_enrichment_bindings WHERE account_id=target_account;
 -- Owner Apps receipt provenance. The acceptance rows deleted above carried the
 -- actor/owner relation, but each receipt's own response still names the owner's
 -- recommendation, binding, snapshot and generation. Retire the receipt and drop the
 -- response; the 0035 response CHECK requires response IS NULL once the status is neither
 -- pending nor completed, so this stays within the existing receipt domain and uses the
 -- status/response UPDATE that already exists. Scoped to the four Apps enrichment
 -- operations, so NO protected lifecycle receipt and no other category's receipt is
 -- touched, and the receipt row itself is retained for lifecycle FK coherence.
 UPDATE public.application_command_receipts SET status='retired',response=NULL
   WHERE account_id=target_account AND status<>'retired'
     AND operation IN ('configureAppEnrichment','rebindAppEnrichment','disableAppEnrichment','acceptAppEnrichment');
 -- END Apps enrichment owner provenance.
 DELETE FROM public.sample_seeding_receipts WHERE account_id=target_account;
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
