-- Canonical local analytics; legacy publisher receipts remain historical until Epic8.
CREATE TABLE analytics_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 account_id uuid NOT NULL REFERENCES creator_accounts(id) ON DELETE RESTRICT,
 client_event_id text NOT NULL CHECK(length(client_event_id) BETWEEN 8 AND 128),
 event_type text NOT NULL CHECK(event_type IN ('view','click','interaction')),
 page text NOT NULL CHECK(page IN ('public-profile','public-home','recommendation-detail','public-music','public-movies','public-books','public-games','public-apps','public-products','public-people','public-guides')),
 category text CHECK(category IN ('places','guides','music','movies','books','games','apps','products','people')),
 collection_id uuid, recommendation_id uuid,
 occurred_at timestamptz NOT NULL,received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 canonical_path text NOT NULL CHECK(length(canonical_path) BETWEEN 1 AND 2048 AND canonical_path LIKE '/%' AND canonical_path !~ '[?#\\]'),
 element text CHECK(length(element)<=256),referrer_origin text CHECK(length(referrer_origin)<=255),
 utm jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(utm)='object' AND utm-ARRAY['utm_source','utm_medium','utm_campaign','utm_term','utm_content']='{}'::jsonb),
 metadata jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(metadata)='object' AND metadata-ARRAY['action','index','totalItems','context','platform','originalElement','cityId','cityName','cityname','city','viewType','recommendationId','placeId','placeName','category','recommendationType','title','authors','listName','sector','genre','subject','guideName','mediaType','genres','listId','id','guideId','guideType','artist','youtubeId','placeSlug','selectedCity']='{}'::jsonb),
 country_code text CHECK(country_code ~ '^[A-Z]{2}$'),consent_version text NOT NULL CHECK(length(consent_version) BETWEEN 1 AND 128),
 UNIQUE(account_id,client_event_id),UNIQUE(id,account_id,client_event_id),
 FOREIGN KEY(collection_id,account_id,category) REFERENCES collections(id,account_id,category) ON DELETE RESTRICT,
 FOREIGN KEY(recommendation_id,account_id,category) REFERENCES recommendations(id,account_id,category) ON DELETE RESTRICT,
 CHECK((collection_id IS NULL AND recommendation_id IS NULL) OR category IS NOT NULL)
);
CREATE INDEX analytics_events_account_time ON analytics_events(account_id,occurred_at,id);
CREATE INDEX analytics_events_account_category_time ON analytics_events(account_id,category,occurred_at);
CREATE INDEX analytics_events_collection_time ON analytics_events(collection_id,occurred_at);
CREATE INDEX analytics_events_recommendation_time ON analytics_events(recommendation_id,occurred_at);
CREATE TABLE analytics_event_receipts (
 account_id uuid NOT NULL REFERENCES creator_accounts(id) ON DELETE RESTRICT,
 client_event_id text NOT NULL CHECK(length(client_event_id) BETWEEN 8 AND 128),
 input_hash bytea NOT NULL CHECK(octet_length(input_hash)=32),event_id uuid,
 accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(),retired_at timestamptz,
 PRIMARY KEY(account_id,client_event_id),UNIQUE(event_id),
 FOREIGN KEY(event_id,account_id,client_event_id) REFERENCES analytics_events(id,account_id,client_event_id) ON DELETE RESTRICT,
 CHECK(event_id IS NOT NULL OR retired_at IS NOT NULL)
);
CREATE INDEX analytics_event_receipts_accepted_account ON analytics_event_receipts(accepted_at,account_id);
CREATE FUNCTION purge_expired_analytics_events(batch_size integer) RETURNS integer
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE target uuid; removed integer:=0; examined integer:=0; candidate_count integer; ids uuid[]; changed integer;
BEGIN
 IF batch_size IS NULL OR batch_size<1 OR batch_size>100 THEN RAISE EXCEPTION 'Invalid analytics retention batch'; END IF;
 FOR target IN SELECT a.id FROM public.creator_accounts a WHERE EXISTS(SELECT 1 FROM public.analytics_events e WHERE e.account_id=a.id AND e.occurred_at<clock_timestamp()-interval '366 days') ORDER BY a.id LIMIT batch_size FOR SHARE OF a SKIP LOCKED LOOP
  WITH candidates AS MATERIALIZED (
   SELECT id,account_id,client_event_id FROM public.analytics_events
    WHERE account_id=target AND occurred_at<clock_timestamp()-interval '366 days'
    ORDER BY occurred_at,id LIMIT batch_size-examined FOR UPDATE SKIP LOCKED
  ) SELECT array_agg(id) FILTER(WHERE pg_try_advisory_xact_lock(44036,hashtext(account_id::text||':'||client_event_id))),count(*)
    INTO ids,candidate_count FROM candidates;
  examined:=examined+candidate_count;
  IF ids IS NOT NULL THEN
   UPDATE public.analytics_event_receipts SET retired_at=clock_timestamp(),event_id=NULL WHERE event_id=ANY(ids);
   DELETE FROM public.analytics_events WHERE id=ANY(ids);GET DIAGNOSTICS changed=ROW_COUNT;removed:=removed+changed;
  END IF;
  EXIT WHEN examined>=batch_size;
 END LOOP;
 RETURN removed;
END $$;
REVOKE ALL ON analytics_events,analytics_event_receipts FROM PUBLIC,music_runtime;
GRANT SELECT,INSERT ON analytics_events,analytics_event_receipts TO music_runtime;
REVOKE ALL ON FUNCTION purge_expired_analytics_events(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION purge_expired_analytics_events(integer) TO music_runtime;
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
 DELETE FROM public.recommendations WHERE account_id=target_account;
 GET DIAGNOSTICS removed_recommendations=ROW_COUNT;
 DELETE FROM public.account_category_pin_state WHERE account_id=target_account;
 RETURN removed_collections+removed_recommendations;
END $$;
