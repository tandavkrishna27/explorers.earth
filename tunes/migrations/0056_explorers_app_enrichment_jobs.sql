-- Durable Apps work. No approval, provider, login, schedule, secret or operational defaults.
-- Root provisions the NOLOGIN owner and worker capability before applying this migration.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='app_enrichment_worker_owner' AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND NOT rolinherit)
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='app_enrichment_worker' AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND NOT rolinherit)
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='app_enrichment_retention_owner' AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND NOT rolinherit)
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='app_enrichment_retention' AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND NOT rolinherit)
 OR EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname='app_enrichment_worker')
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Apps worker custody must be provisioned before migration'; END IF;
END $$;

CREATE TABLE app_enrichment_source_approvals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 source_id text NOT NULL CHECK(octet_length(source_id) BETWEEN 1 AND 2048),
 source_identity text NOT NULL CHECK(octet_length(source_identity) BETWEEN 1 AND 2048),
 source_identity_hash text NOT NULL CHECK(source_identity_hash ~ '^[a-f0-9]{64}$'),
 canonicalization_version text NOT NULL CHECK(octet_length(canonicalization_version) BETWEEN 1 AND 2048),
 enabled boolean NOT NULL,
 approval_revision bigint NOT NULL CHECK(approval_revision BETWEEN 1 AND 9007199254740991),
 adapter_version text NOT NULL CHECK(octet_length(adapter_version) BETWEEN 1 AND 2048),
 canonical_url text NOT NULL CHECK(octet_length(canonical_url) BETWEEN 1 AND 2048 AND canonical_url ~ '^https://[^/@[:space:]]+([/?#][^[:space:]]*)?$'),
 canonical_url_policy_version text NOT NULL CHECK(octet_length(canonical_url_policy_version) BETWEEN 1 AND 2048),
 allowed_fields text[] NOT NULL CHECK(cardinality(allowed_fields) BETWEEN 1 AND 4 AND allowed_fields <@ ARRAY['title','description','priceTier','platforms']::text[]),
 allowed_hosts text[] NOT NULL CHECK(cardinality(allowed_hosts)>0),
 configuration_fingerprint text NOT NULL CHECK(configuration_fingerprint ~ '^[a-f0-9]{64}$'),
 -- Only nonsecret numeric policy. URLs, request headers, tokens and credentials are absent.
 operational_configuration jsonb NOT NULL,
 UNIQUE(source_id,source_identity_hash,canonicalization_version),
 UNIQUE(id,source_id,source_identity,source_identity_hash,canonicalization_version),
 UNIQUE(id,approval_revision)
);
CREATE FUNCTION app_enrichment_worker_approval_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE required text[] = ARRAY['leaseDurationMs','heartbeatIntervalMs','maxAttempts','retryMinDelayMs','retryMaxDelayMs','retryAfterMaxMs','jobConcurrency','maxJobsPerRun','maxRequestsPerRun','maxBytesPerRun','maxRuntimeMs','maxCostUnitsPerRun','costUnitsPerRequest','retentionDays','authorityTimeoutMs','authorityCleanupTimeoutMs']; k text;
BEGIN
 IF TG_OP='UPDATE' AND (ROW(NEW.id,NEW.source_id,NEW.source_identity,NEW.source_identity_hash,NEW.canonicalization_version) IS DISTINCT FROM ROW(OLD.id,OLD.source_id,OLD.source_identity,OLD.source_identity_hash,OLD.canonicalization_version) OR NEW.approval_revision<=OLD.approval_revision) THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Approval identity is immutable and revision must advance';
 END IF;
 IF jsonb_typeof(NEW.operational_configuration)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(NEW.operational_configuration))<>cardinality(required) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Explicit worker limits required'; END IF;
 FOREACH k IN ARRAY required LOOP
  IF NOT NEW.operational_configuration ? k OR jsonb_typeof(NEW.operational_configuration->k)<>'number' OR (NEW.operational_configuration->>k) !~ '^[0-9]+$' OR (NEW.operational_configuration->>k)::numeric NOT BETWEEN 1 AND 9007199254740991 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invalid worker limit'; END IF;
 END LOOP;
 IF (NEW.operational_configuration->>'heartbeatIntervalMs')::numeric >= (NEW.operational_configuration->>'leaseDurationMs')::numeric OR (NEW.operational_configuration->>'retryMinDelayMs')::numeric>(NEW.operational_configuration->>'retryMaxDelayMs')::numeric OR (NEW.operational_configuration->>'retryAfterMaxMs')::numeric>(NEW.operational_configuration->>'retryMaxDelayMs')::numeric THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invalid worker limit relationships'; END IF;
 IF (NEW.operational_configuration->>'authorityTimeoutMs')::numeric>(NEW.operational_configuration->>'maxRuntimeMs')::numeric OR EXISTS(SELECT 1 FROM unnest(ARRAY['leaseDurationMs','heartbeatIntervalMs','retryMinDelayMs','retryMaxDelayMs','retryAfterMaxMs','maxRuntimeMs','authorityTimeoutMs','authorityCleanupTimeoutMs']) key WHERE (NEW.operational_configuration->>key)::numeric>2147483647) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invalid worker duration'; END IF;
 BEGIN PERFORM clock_timestamp()+(NEW.operational_configuration->>'retentionDays')::bigint*interval '1 day';EXCEPTION WHEN datetime_field_overflow OR interval_field_overflow OR numeric_value_out_of_range THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Unsupported frozen retention interval';END;
 IF (SELECT count(DISTINCT f) FROM unnest(NEW.allowed_fields) f)<>cardinality(NEW.allowed_fields) OR EXISTS(SELECT 1 FROM unnest(NEW.allowed_hosts) h WHERE h IS NULL OR h<>lower(h) OR h !~ '^([a-z0-9-]+[.])*[a-z0-9-]+$' OR NOT public.app_enrichment_safe_host(h)) OR (SELECT count(DISTINCT h) FROM unnest(NEW.allowed_hosts) h)<>cardinality(NEW.allowed_hosts) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invalid approval allowlist'; END IF;
 IF substring(NEW.canonical_url FROM '^https://([^/:?#]+)') IS NULL OR NOT substring(NEW.canonical_url FROM '^https://([^/:?#]+)')=ANY(NEW.allowed_hosts) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invalid approved canonical URL'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER app_enrichment_source_approval_guard BEFORE INSERT OR UPDATE ON app_enrichment_source_approvals FOR EACH ROW EXECUTE FUNCTION app_enrichment_worker_approval_guard();

CREATE TABLE app_enrichment_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), app_entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
 source_id text NOT NULL, source_identity text NOT NULL, source_identity_hash text NOT NULL,
 canonicalization_version text NOT NULL, run_date date NOT NULL,
 approval_id uuid NOT NULL REFERENCES app_enrichment_source_approvals(id) ON DELETE RESTRICT,
 approval_revision bigint NOT NULL CHECK(approval_revision BETWEEN 1 AND 9007199254740991), configuration_fingerprint text NOT NULL CHECK(configuration_fingerprint ~ '^[a-f0-9]{64}$'),
 state text NOT NULL CHECK(state IN ('queued','leased','succeeded','unavailable','retry-wait','exhausted','cancelled')),
 attempt bigint NOT NULL DEFAULT 0 CHECK(attempt>=0), max_attempts bigint NOT NULL CHECK(max_attempts BETWEEN 1 AND 9007199254740991),
 retention_days bigint NOT NULL CHECK(retention_days BETWEEN 1 AND 9007199254740991), terminalized_at timestamptz, terminal_retained_until timestamptz,
 lease_duration_ms bigint NOT NULL CHECK(lease_duration_ms>0), retry_min_delay_ms bigint NOT NULL CHECK(retry_min_delay_ms>0), retry_max_delay_ms bigint NOT NULL CHECK(retry_max_delay_ms>=retry_min_delay_ms),
 next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(), lease_token uuid, lease_holder uuid, lease_expires_at timestamptz,
 completed_snapshot_id uuid REFERENCES app_enrichment_snapshots(id) ON DELETE RESTRICT,
 outcome text CHECK(outcome IN ('success','unavailable','retry','invalid','cancelled','approval-conflict','lease-expired')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(app_entity_id,source_id,source_identity_hash,canonicalization_version,run_date),
 UNIQUE(id,app_entity_id,source_id,source_identity,source_identity_hash,canonicalization_version,approval_revision),
 FOREIGN KEY(approval_id,source_id,source_identity,source_identity_hash,canonicalization_version) REFERENCES app_enrichment_source_approvals(id,source_id,source_identity,source_identity_hash,canonicalization_version) ON DELETE RESTRICT,
 CHECK(attempt<=max_attempts),
 CHECK((state='leased')=(lease_token IS NOT NULL AND lease_holder IS NOT NULL AND lease_expires_at IS NOT NULL)),
 CHECK(state='leased' OR (lease_token IS NULL AND lease_holder IS NULL AND lease_expires_at IS NULL)),
 CHECK((state='succeeded')=(completed_snapshot_id IS NOT NULL))
 ,CHECK((state IN ('succeeded','unavailable','exhausted','cancelled'))=(terminalized_at IS NOT NULL AND terminal_retained_until IS NOT NULL))
 ,CHECK(state IN ('succeeded','unavailable','exhausted','cancelled') OR (terminalized_at IS NULL AND terminal_retained_until IS NULL))
 ,CHECK(terminalized_at IS NULL OR terminal_retained_until>terminalized_at)
);
CREATE INDEX app_enrichment_jobs_due_idx ON app_enrichment_jobs(approval_id,next_attempt_at,id) WHERE state IN ('queued','retry-wait','leased');
CREATE INDEX app_enrichment_jobs_retention_idx ON app_enrichment_jobs(terminal_retained_until,id) WHERE state IN ('succeeded','unavailable','exhausted','cancelled');
CREATE TABLE app_enrichment_job_candidates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_id uuid NOT NULL REFERENCES app_enrichment_jobs(id) ON DELETE RESTRICT,
 account_id uuid NOT NULL, recommendation_id uuid NOT NULL, binding_id uuid NOT NULL, generation_id uuid NOT NULL, app_entity_id uuid NOT NULL,
 observed_binding_revision bigint NOT NULL CHECK(observed_binding_revision BETWEEN 1 AND 9007199254740991), approval_revision bigint NOT NULL,
 source_id text NOT NULL, source_identity text NOT NULL, source_identity_hash text NOT NULL, canonicalization_version text NOT NULL,
 UNIQUE(job_id,generation_id,observed_binding_revision),
 FOREIGN KEY(job_id,app_entity_id,source_id,source_identity,source_identity_hash,canonicalization_version,approval_revision) REFERENCES app_enrichment_jobs(id,app_entity_id,source_id,source_identity,source_identity_hash,canonicalization_version,approval_revision) ON DELETE RESTRICT,
 FOREIGN KEY(generation_id,binding_id,account_id,recommendation_id,app_entity_id) REFERENCES app_enrichment_generations(id,binding_id,account_id,recommendation_id,app_entity_id) ON DELETE RESTRICT
);
CREATE INDEX app_enrichment_job_candidates_owner_idx ON app_enrichment_job_candidates(account_id);
CREATE INDEX app_enrichment_job_candidates_retention_idx ON app_enrichment_job_candidates(job_id,id);
CREATE TRIGGER app_enrichment_job_candidate_immutable BEFORE UPDATE ON app_enrichment_job_candidates FOR EACH ROW EXECUTE FUNCTION app_enrichment_immutable_payload();
CREATE TABLE app_enrichment_worker_run_authorities (
 id uuid PRIMARY KEY, schedule_id text NOT NULL CHECK(schedule_id ~ '^[A-Za-z0-9._-]{1,100}$'),
 run_date date NOT NULL, started_at timestamptz NOT NULL, expires_at timestamptz NOT NULL CHECK(expires_at>started_at),receipt_deadline_at timestamptz NOT NULL CHECK(receipt_deadline_at>expires_at),
 UNIQUE(id,schedule_id,run_date)
);
CREATE TRIGGER app_enrichment_worker_run_authority_immutable BEFORE UPDATE ON app_enrichment_worker_run_authorities FOR EACH ROW EXECUTE FUNCTION app_enrichment_immutable_payload();
CREATE INDEX app_enrichment_worker_authority_date_idx ON app_enrichment_worker_run_authorities(run_date,expires_at,id);
CREATE INDEX app_enrichment_worker_authority_retention_idx ON app_enrichment_worker_run_authorities(receipt_deadline_at,id);
CREATE FUNCTION app_enrichment_worker_job_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.retention_days IS DISTINCT FROM OLD.retention_days THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Immutable job retention policy'; END IF;
 IF TG_OP='UPDATE' AND (ROW(NEW.id,NEW.app_entity_id,NEW.source_id,NEW.source_identity,NEW.source_identity_hash,NEW.canonicalization_version,NEW.run_date,NEW.approval_id,NEW.approval_revision,NEW.configuration_fingerprint,NEW.max_attempts,NEW.lease_duration_ms,NEW.retry_min_delay_ms,NEW.retry_max_delay_ms,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.app_entity_id,OLD.source_id,OLD.source_identity,OLD.source_identity_hash,OLD.canonicalization_version,OLD.run_date,OLD.approval_id,OLD.approval_revision,OLD.configuration_fingerprint,OLD.max_attempts,OLD.lease_duration_ms,OLD.retry_min_delay_ms,OLD.retry_max_delay_ms,OLD.created_at) OR OLD.state IN ('succeeded','unavailable','exhausted','cancelled')) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Immutable Apps job identity or terminal state'; END IF;
 IF OLD.state NOT IN ('succeeded','unavailable','exhausted','cancelled') AND NEW.state IN ('succeeded','unavailable','exhausted','cancelled') THEN NEW.terminalized_at=clock_timestamp();NEW.terminal_retained_until=NEW.terminalized_at+NEW.retention_days*interval '1 day'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER app_enrichment_job_identity_guard BEFORE UPDATE ON app_enrichment_jobs FOR EACH ROW EXECUTE FUNCTION app_enrichment_worker_job_guard();
CREATE TABLE app_enrichment_worker_runs (
 id uuid PRIMARY KEY, schedule_id text NOT NULL CHECK(schedule_id ~ '^[A-Za-z0-9._-]{1,100}$'), run_date date NOT NULL,
 started_at timestamptz NOT NULL, ended_at timestamptz NOT NULL CHECK(ended_at>=started_at),recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(), receipt jsonb NOT NULL,
 FOREIGN KEY(id,schedule_id,run_date) REFERENCES app_enrichment_worker_run_authorities(id,schedule_id,run_date) ON DELETE RESTRICT
);
CREATE TRIGGER app_enrichment_worker_run_immutable BEFORE UPDATE ON app_enrichment_worker_runs FOR EACH ROW EXECUTE FUNCTION app_enrichment_immutable_payload();
CREATE INDEX app_enrichment_worker_run_retention_idx ON app_enrichment_worker_runs(recorded_at,id);

-- Internal helpers are not worker entrypoints. All owner rows precede all category locks,
-- then all recommendation rows, then all binding rows. The candidate set never expands.
CREATE FUNCTION app_enrichment_worker_lock_candidates(candidate_ids uuid[]) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE owner_id uuid;
BEGIN
 PERFORM a.id FROM public.creator_accounts a WHERE a.id IN(SELECT c.account_id FROM public.app_enrichment_job_candidates c WHERE c.id=ANY(candidate_ids)) ORDER BY a.id FOR UPDATE;
 FOR owner_id IN SELECT DISTINCT c.account_id FROM public.app_enrichment_job_candidates c WHERE c.id=ANY(candidate_ids) ORDER BY c.account_id LOOP PERFORM pg_advisory_xact_lock(44031,hashtext(owner_id::text||':apps')); END LOOP;
 PERFORM r.id FROM public.recommendations r WHERE r.id IN(SELECT c.recommendation_id FROM public.app_enrichment_job_candidates c WHERE c.id=ANY(candidate_ids)) ORDER BY r.id FOR UPDATE;
 PERFORM b.id FROM public.app_enrichment_bindings b WHERE b.id IN(SELECT c.binding_id FROM public.app_enrichment_job_candidates c WHERE c.id=ANY(candidate_ids)) ORDER BY b.id FOR UPDATE;
END $$;
CREATE FUNCTION app_enrichment_worker_binding_eligible(p_binding_id uuid,p_generation_id uuid,p_observed_revision bigint) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM public.app_enrichment_bindings b JOIN public.app_enrichment_generations g ON g.id=b.current_generation_id AND g.binding_id=b.id JOIN public.creator_accounts a ON a.id=b.account_id JOIN public.account_category_settings s ON s.account_id=a.id AND s.category='apps' JOIN public.recommendations r ON r.id=b.recommendation_id AND r.account_id=b.account_id JOIN public.entities e ON e.id=r.entity_id WHERE b.id=p_binding_id AND g.id=p_generation_id AND b.binding_revision=p_observed_revision AND b.opt_in AND b.app_entity_id=r.entity_id AND g.app_entity_id=r.entity_id AND a.status='active' AND a.onboarding_status='complete' AND a.public_profile AND s.is_public AND r.category='apps' AND r.archived_at IS NULL AND r.publication_state='published' AND e.kind='app' AND e.origin='manual' AND NOT EXISTS(SELECT 1 FROM public.app_enrichment_generation_retirements x WHERE x.generation_id=g.id) AND EXISTS(SELECT 1 FROM public.collection_items i JOIN public.collections c ON c.id=i.collection_id AND c.account_id=i.account_id AND c.category=i.category WHERE i.recommendation_id=r.id AND i.account_id=r.account_id AND i.category='apps' AND c.archived_at IS NULL AND c.visibility='public' AND c.publication_state='published'))
$$;
CREATE FUNCTION app_enrichment_worker_lease_json(j public.app_enrichment_jobs) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('jobId',j.id,'token',j.lease_token,'holder',j.lease_holder,'appEntityId',j.app_entity_id,'sourceId',j.source_id,'sourceIdentity',j.source_identity,'sourceIdentityHash',j.source_identity_hash,'canonicalizationVersion',j.canonicalization_version,'runDate',to_char(j.run_date,'YYYY-MM-DD'),'approvalRevision',j.approval_revision,'configurationFingerprint',j.configuration_fingerprint,'attempt',j.attempt,'leaseExpiresAt',to_char(j.lease_expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
$$;

CREATE FUNCTION app_enrichment_worker_enroll_run(run_uuid uuid,schedule_identifier text,run_day text,source_identifier text,identity_value text,identity_hash text,canonical_version text,revision bigint,fingerprint text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a public.app_enrichment_source_approvals%ROWTYPE; b record; j public.app_enrichment_jobs%ROWTYPE; authority public.app_enrichment_worker_run_authorities%ROWTYPE; binding_ids uuid[]; owner_id uuid; total integer=0; conflicts integer=0; day date; invocation timestamptz=clock_timestamp();
BEGIN
 IF run_day !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invalid UTC run date'; END IF;
 day=run_day::date; IF to_char(day,'YYYY-MM-DD')<>run_day THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invalid UTC run date'; END IF;
 SELECT * INTO a FROM public.app_enrichment_source_approvals WHERE source_id=source_identifier AND source_identity_hash=identity_hash AND canonicalization_version=canonical_version FOR SHARE;
 IF NOT FOUND OR NOT a.enabled THEN RETURN jsonb_build_object('status','disabled','eligible',0); END IF;
 IF a.source_identity<>identity_value OR a.approval_revision<>revision OR a.configuration_fingerprint<>fingerprint THEN RETURN jsonb_build_object('status','approval-conflict','eligible',0); END IF;
 IF run_uuid IS NULL OR schedule_identifier IS NULL OR schedule_identifier !~ '^[A-Za-z0-9._-]{1,100}$' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invalid trusted run identity'; END IF;
 -- 44056 is the Apps UTC-date authority namespace, separate from content categories.
 PERFORM pg_advisory_xact_lock_shared(44056,(day-date '2000-01-01')::integer);
 SELECT * INTO authority FROM public.app_enrichment_worker_run_authorities WHERE id=run_uuid FOR SHARE;
 IF NOT FOUND THEN
  invocation=clock_timestamp();
  IF day<>(invocation AT TIME ZONE 'UTC')::date THEN RETURN jsonb_build_object('status','approval-conflict','eligible',0); END IF;
  INSERT INTO public.app_enrichment_worker_run_authorities(id,schedule_id,run_date,started_at,expires_at,receipt_deadline_at) VALUES(run_uuid,schedule_identifier,(invocation AT TIME ZONE 'UTC')::date,invocation,invocation+(a.operational_configuration->>'maxRuntimeMs')::bigint*interval '1 millisecond',invocation+((a.operational_configuration->>'maxRuntimeMs')::bigint+(a.operational_configuration->>'authorityCleanupTimeoutMs')::bigint)*interval '1 millisecond') ON CONFLICT(id) DO NOTHING;
  -- A concurrent first registration wins once. Re-read its immutable authority;
  -- never accept independently calculated dates/windows for the same run UUID.
  SELECT * INTO authority FROM public.app_enrichment_worker_run_authorities WHERE id=run_uuid FOR SHARE;
 END IF;
 IF authority.schedule_id<>schedule_identifier OR authority.run_date<>day OR clock_timestamp()>=authority.expires_at OR clock_timestamp()>=authority.started_at+(a.operational_configuration->>'maxRuntimeMs')::bigint*interval '1 millisecond' THEN RETURN jsonb_build_object('status','approval-conflict','eligible',0); END IF;
 SELECT array_agg(x.id ORDER BY x.id) INTO binding_ids FROM public.app_enrichment_bindings x JOIN public.app_enrichment_generations g ON g.id=x.current_generation_id WHERE g.source_id=a.source_id AND g.source_identity=a.source_identity AND g.source_identity_hash=a.source_identity_hash AND g.canonicalization_version=a.canonicalization_version;
 PERFORM x.id FROM public.creator_accounts x WHERE x.id IN(SELECT y.account_id FROM public.app_enrichment_bindings y WHERE y.id=ANY(binding_ids)) ORDER BY x.id FOR UPDATE;
 FOR owner_id IN SELECT DISTINCT x.account_id FROM public.app_enrichment_bindings x WHERE x.id=ANY(binding_ids) ORDER BY x.account_id LOOP PERFORM pg_advisory_xact_lock(44031,hashtext(owner_id::text||':apps')); END LOOP;
 PERFORM x.id FROM public.recommendations x WHERE x.id IN(SELECT y.recommendation_id FROM public.app_enrichment_bindings y WHERE y.id=ANY(binding_ids)) ORDER BY x.id FOR UPDATE;
 PERFORM x.id FROM public.app_enrichment_bindings x WHERE x.id=ANY(binding_ids) ORDER BY x.id FOR UPDATE;
 IF authority.schedule_id<>schedule_identifier OR authority.run_date<>day OR clock_timestamp()>=authority.expires_at OR clock_timestamp()>=authority.started_at+(a.operational_configuration->>'maxRuntimeMs')::bigint*interval '1 millisecond' THEN RETURN jsonb_build_object('status','approval-conflict','eligible',0); END IF;
 FOR b IN SELECT x.*,g.source_id,g.source_identity,g.source_identity_hash,g.canonicalization_version FROM public.app_enrichment_bindings x JOIN public.app_enrichment_generations g ON g.id=x.current_generation_id WHERE x.id=ANY(binding_ids) AND g.source_id=a.source_id AND g.source_identity=a.source_identity AND g.source_identity_hash=a.source_identity_hash AND g.canonicalization_version=a.canonicalization_version AND public.app_enrichment_worker_binding_eligible(x.id,g.id,x.binding_revision) ORDER BY x.app_entity_id,x.id LOOP
  IF clock_timestamp()>=authority.expires_at OR clock_timestamp()>=authority.started_at+(a.operational_configuration->>'maxRuntimeMs')::bigint*interval '1 millisecond' THEN RETURN jsonb_build_object('status','approval-conflict','eligible',total); END IF;
  INSERT INTO public.app_enrichment_jobs(app_entity_id,source_id,source_identity,source_identity_hash,canonicalization_version,run_date,approval_id,approval_revision,configuration_fingerprint,state,max_attempts,retention_days,lease_duration_ms,retry_min_delay_ms,retry_max_delay_ms) VALUES(b.app_entity_id,a.source_id,a.source_identity,a.source_identity_hash,a.canonicalization_version,day,a.id,a.approval_revision,a.configuration_fingerprint,'queued',(a.operational_configuration->>'maxAttempts')::bigint,(a.operational_configuration->>'retentionDays')::bigint,(a.operational_configuration->>'leaseDurationMs')::bigint,(a.operational_configuration->>'retryMinDelayMs')::bigint,(a.operational_configuration->>'retryMaxDelayMs')::bigint) ON CONFLICT(app_entity_id,source_id,source_identity_hash,canonicalization_version,run_date) DO NOTHING;
  SELECT * INTO j FROM public.app_enrichment_jobs WHERE app_entity_id=b.app_entity_id AND source_id=a.source_id AND source_identity_hash=a.source_identity_hash AND canonicalization_version=a.canonicalization_version AND run_date=day FOR UPDATE;
  IF j.source_identity<>a.source_identity THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Exact source identity collision'; END IF;
  IF j.approval_revision<>a.approval_revision OR j.configuration_fingerprint<>a.configuration_fingerprint THEN
   conflicts=conflicts+1;
   IF j.state IN ('queued','leased','retry-wait') THEN UPDATE public.app_enrichment_jobs SET state='cancelled',outcome='approval-conflict',lease_token=NULL,lease_holder=NULL,lease_expires_at=NULL,updated_at=clock_timestamp() WHERE id=j.id; END IF;
  ELSE
   INSERT INTO public.app_enrichment_job_candidates(job_id,account_id,recommendation_id,binding_id,generation_id,app_entity_id,observed_binding_revision,approval_revision,source_id,source_identity,source_identity_hash,canonicalization_version) VALUES(j.id,b.account_id,b.recommendation_id,b.id,b.current_generation_id,b.app_entity_id,b.binding_revision,a.approval_revision,a.source_id,a.source_identity,a.source_identity_hash,a.canonicalization_version) ON CONFLICT(job_id,generation_id,observed_binding_revision) DO NOTHING;
   total=total+1;
  END IF;
 END LOOP;
 RETURN jsonb_build_object('status',CASE WHEN conflicts>0 THEN 'approval-conflict' ELSE 'enrolled' END,'eligible',total);
END $$;

CREATE FUNCTION app_enrichment_worker_claim(holder uuid,source_identifier text,identity_value text,identity_hash text,canonical_version text,revision bigint,fingerprint text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a public.app_enrichment_source_approvals%ROWTYPE; j public.app_enrichment_jobs%ROWTYPE;
BEGIN
 IF holder IS NULL THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Worker holder required'; END IF;
 SELECT * INTO a FROM public.app_enrichment_source_approvals WHERE source_id=source_identifier AND source_identity_hash=identity_hash AND canonicalization_version=canonical_version FOR SHARE;
 IF NOT FOUND OR NOT a.enabled THEN RETURN jsonb_build_object('status','idle'); END IF;
 IF a.source_identity<>identity_value OR a.approval_revision<>revision OR a.configuration_fingerprint<>fingerprint THEN RETURN jsonb_build_object('status','approval-conflict'); END IF;
 FOR j IN SELECT x.* FROM public.app_enrichment_jobs x WHERE x.approval_id=a.id AND x.state IN ('queued','retry-wait','leased') AND (x.state='leased' AND x.lease_expires_at<=clock_timestamp() OR x.state<>'leased' AND x.next_attempt_at<=clock_timestamp()) ORDER BY x.next_attempt_at,x.id FOR UPDATE SKIP LOCKED LOOP
  IF j.approval_revision<>a.approval_revision OR j.configuration_fingerprint<>a.configuration_fingerprint THEN UPDATE public.app_enrichment_jobs SET state='cancelled',outcome='approval-conflict',lease_token=NULL,lease_holder=NULL,lease_expires_at=NULL,updated_at=clock_timestamp() WHERE id=j.id; CONTINUE; END IF;
  IF j.attempt>=j.max_attempts THEN UPDATE public.app_enrichment_jobs SET state='exhausted',outcome='lease-expired',lease_token=NULL,lease_holder=NULL,lease_expires_at=NULL,updated_at=clock_timestamp() WHERE id=j.id; CONTINUE; END IF;
  UPDATE public.app_enrichment_jobs SET state='leased',attempt=attempt+1,lease_token=gen_random_uuid(),lease_holder=holder,lease_expires_at=clock_timestamp()+j.lease_duration_ms*interval '1 millisecond',outcome=NULL,updated_at=clock_timestamp() WHERE id=j.id RETURNING * INTO j;
  RETURN jsonb_build_object('status','claimed','lease',public.app_enrichment_worker_lease_json(j));
 END LOOP;
 RETURN jsonb_build_object('status','idle');
END $$;

CREATE FUNCTION app_enrichment_worker_check_fetch(job_uuid uuid,token uuid,holder uuid,fingerprint text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a public.app_enrichment_source_approvals%ROWTYPE; j public.app_enrichment_jobs%ROWTYPE; frozen uuid[]; eligible uuid[];
BEGIN
 SELECT a0.* INTO a FROM public.app_enrichment_source_approvals a0 JOIN public.app_enrichment_jobs j0 ON j0.approval_id=a0.id WHERE j0.id=job_uuid FOR SHARE OF a0;
 SELECT array_agg(id ORDER BY id) INTO frozen FROM public.app_enrichment_job_candidates WHERE job_id=job_uuid;
 PERFORM public.app_enrichment_worker_lock_candidates(frozen);
 SELECT * INTO j FROM public.app_enrichment_jobs WHERE id=job_uuid FOR UPDATE;
 IF NOT FOUND OR j.state<>'leased' OR j.lease_token IS DISTINCT FROM token OR j.lease_holder IS DISTINCT FROM holder OR j.lease_expires_at<=clock_timestamp() THEN RETURN jsonb_build_object('status','lease-lost'); END IF;
 IF NOT a.enabled OR a.approval_revision<>j.approval_revision OR a.configuration_fingerprint<>fingerprint OR fingerprint<>j.configuration_fingerprint THEN UPDATE public.app_enrichment_jobs SET state='cancelled',outcome='approval-conflict',lease_token=NULL,lease_holder=NULL,lease_expires_at=NULL,updated_at=clock_timestamp() WHERE id=j.id; RETURN jsonb_build_object('status','approval-conflict'); END IF;
 SELECT array_agg(c.id ORDER BY c.id) INTO eligible FROM public.app_enrichment_job_candidates c WHERE c.id=ANY(frozen) AND c.approval_revision=j.approval_revision AND public.app_enrichment_worker_binding_eligible(c.binding_id,c.generation_id,c.observed_binding_revision);
 IF eligible IS NULL THEN UPDATE public.app_enrichment_jobs SET state='cancelled',outcome='cancelled',lease_token=NULL,lease_holder=NULL,lease_expires_at=NULL,updated_at=clock_timestamp() WHERE id=j.id; RETURN jsonb_build_object('status','cancelled'); END IF;
 RETURN jsonb_build_object('status','eligible','candidateIds',to_jsonb(eligible));
END $$;
CREATE FUNCTION app_enrichment_worker_renew(job_uuid uuid,token uuid,holder uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a public.app_enrichment_source_approvals%ROWTYPE; j public.app_enrichment_jobs%ROWTYPE;
BEGIN
 SELECT a0.* INTO a FROM public.app_enrichment_source_approvals a0 JOIN public.app_enrichment_jobs j0 ON j0.approval_id=a0.id WHERE j0.id=job_uuid FOR SHARE OF a0;
 SELECT * INTO j FROM public.app_enrichment_jobs WHERE id=job_uuid FOR UPDATE;
 IF NOT FOUND OR j.state<>'leased' OR j.lease_token IS DISTINCT FROM token OR j.lease_holder IS DISTINCT FROM holder OR j.lease_expires_at<=clock_timestamp() THEN RETURN jsonb_build_object('status','lease-lost'); END IF;
 IF NOT a.enabled OR a.approval_revision<>j.approval_revision OR a.configuration_fingerprint<>j.configuration_fingerprint THEN UPDATE public.app_enrichment_jobs SET state='cancelled',outcome='approval-conflict',lease_token=NULL,lease_holder=NULL,lease_expires_at=NULL,updated_at=clock_timestamp() WHERE id=j.id; RETURN jsonb_build_object('status','lease-lost'); END IF;
 UPDATE public.app_enrichment_jobs SET lease_expires_at=clock_timestamp()+j.lease_duration_ms*interval '1 millisecond',updated_at=clock_timestamp() WHERE id=j.id;
 RETURN jsonb_build_object('status','renewed');
END $$;

CREATE FUNCTION app_enrichment_worker_complete(job_uuid uuid,token uuid,holder uuid,fingerprint text,candidate_ids uuid[],snapshot jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a public.app_enrichment_source_approvals%ROWTYPE; j public.app_enrichment_jobs%ROWTYPE; frozen uuid[]; eligible uuid[]; k text; host text; granted integer;
BEGIN
 SELECT a0.* INTO a FROM public.app_enrichment_source_approvals a0 JOIN public.app_enrichment_jobs j0 ON j0.approval_id=a0.id WHERE j0.id=job_uuid FOR SHARE OF a0;
 -- Untrusted candidate IDs are intersected with the job before locking. Only this frozen set is processed.
 SELECT array_agg(id ORDER BY id) INTO frozen FROM public.app_enrichment_job_candidates WHERE job_id=job_uuid AND id=ANY(candidate_ids);
 PERFORM public.app_enrichment_worker_lock_candidates(frozen);
 SELECT * INTO j FROM public.app_enrichment_jobs WHERE id=job_uuid FOR UPDATE;
 IF NOT FOUND OR j.state<>'leased' OR j.lease_token IS DISTINCT FROM token OR j.lease_holder IS DISTINCT FROM holder OR j.lease_expires_at<=clock_timestamp() THEN RETURN jsonb_build_object('status','lease-lost','granted',0); END IF;
 IF NOT a.enabled OR a.approval_revision<>j.approval_revision OR a.configuration_fingerprint<>fingerprint OR fingerprint<>j.configuration_fingerprint THEN UPDATE public.app_enrichment_jobs SET state='cancelled',outcome='approval-conflict',lease_token=NULL,lease_holder=NULL,lease_expires_at=NULL,updated_at=clock_timestamp() WHERE id=j.id; RETURN jsonb_build_object('status','approval-conflict','granted',0); END IF;
 SELECT array_agg(c.id ORDER BY c.id) INTO eligible FROM public.app_enrichment_job_candidates c WHERE c.id=ANY(frozen) AND c.approval_revision=j.approval_revision AND public.app_enrichment_worker_binding_eligible(c.binding_id,c.generation_id,c.observed_binding_revision);
 IF eligible IS NULL THEN UPDATE public.app_enrichment_jobs SET state='cancelled',outcome='cancelled',lease_token=NULL,lease_holder=NULL,lease_expires_at=NULL,updated_at=clock_timestamp() WHERE id=j.id; RETURN jsonb_build_object('status','cancelled','granted',0); END IF;
 IF snapshot->>'appEntityId'<>j.app_entity_id::text OR snapshot->>'sourceId'<>j.source_id OR snapshot->>'sourceIdentity'<>j.source_identity OR snapshot->>'sourceIdentityHash'<>j.source_identity_hash OR snapshot->>'canonicalizationVersion'<>j.canonicalization_version OR snapshot->>'adapterVersion'<>a.adapter_version THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Snapshot source authority mismatch'; END IF;
 IF jsonb_typeof(snapshot->'fields')<>'object' OR NOT EXISTS(SELECT 1 FROM jsonb_object_keys(snapshot->'fields')) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Snapshot requires approved fields'; END IF;
 FOR k IN SELECT jsonb_object_keys(snapshot->'fields') LOOP
  IF NOT k=ANY(a.allowed_fields) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Snapshot field not approved'; END IF;
  -- Deliberately canonical https authority; SQL guard remains stricter than reader contract.
  host=substring(snapshot->'fieldProvenance'->k->>'sourceUrl' FROM '^https://([^/:?#]+)');
  IF host IS NULL OR NOT host=ANY(a.allowed_hosts) OR snapshot->'fieldProvenance'->k->>'sourceUrl' IS DISTINCT FROM a.canonical_url THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Snapshot provenance URL not approved'; END IF;
 END LOOP;
 INSERT INTO public.app_enrichment_snapshots(id,app_entity_id,source_id,source_identity,source_identity_hash,canonicalization_version,fetched_at,payload) VALUES((snapshot->>'snapshotId')::uuid,j.app_entity_id,j.source_id,j.source_identity,j.source_identity_hash,j.canonicalization_version,(snapshot->>'fetchedAt')::timestamptz,snapshot);
 INSERT INTO public.app_enrichment_entitlements(snapshot_id,recommendation_id,generation_id,account_id,app_entity_id,observed_binding_revision) SELECT (snapshot->>'snapshotId')::uuid,c.recommendation_id,c.generation_id,c.account_id,c.app_entity_id,c.observed_binding_revision FROM public.app_enrichment_job_candidates c WHERE c.id=ANY(eligible) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS granted=ROW_COUNT;
 UPDATE public.app_enrichment_jobs SET state='succeeded',outcome='success',completed_snapshot_id=(snapshot->>'snapshotId')::uuid,lease_token=NULL,lease_holder=NULL,lease_expires_at=NULL,updated_at=clock_timestamp() WHERE id=j.id;
 RETURN jsonb_build_object('status','succeeded','granted',granted);
END $$;

CREATE FUNCTION app_enrichment_worker_finish_outcome(job_uuid uuid,token uuid,holder uuid,code text,retry_delay_ms bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE j public.app_enrichment_jobs%ROWTYPE; next_state text;
BEGIN
 IF code IS NULL OR code NOT IN ('unavailable','retry','invalid','cancelled') THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invalid sanitized worker outcome'; END IF;
 SELECT * INTO j FROM public.app_enrichment_jobs WHERE id=job_uuid FOR UPDATE;
 IF NOT FOUND OR j.state<>'leased' OR j.lease_token IS DISTINCT FROM token OR j.lease_holder IS DISTINCT FROM holder OR j.lease_expires_at<=clock_timestamp() THEN RETURN jsonb_build_object('status','lease-lost'); END IF;
 IF code='retry' AND (retry_delay_ms IS NULL OR retry_delay_ms<j.retry_min_delay_ms OR retry_delay_ms>j.retry_max_delay_ms) OR code<>'retry' AND retry_delay_ms IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invalid bounded retry delay'; END IF;
 next_state=CASE WHEN code='retry' AND j.attempt<j.max_attempts THEN 'retry-wait' WHEN code IN ('retry','invalid') THEN 'exhausted' WHEN code='unavailable' THEN 'unavailable' ELSE 'cancelled' END;
 UPDATE public.app_enrichment_jobs SET state=next_state,outcome=code,next_attempt_at=CASE WHEN next_state='retry-wait' THEN clock_timestamp()+retry_delay_ms*interval '1 millisecond' ELSE next_attempt_at END,lease_token=NULL,lease_holder=NULL,lease_expires_at=NULL,updated_at=clock_timestamp() WHERE id=j.id;
 RETURN jsonb_build_object('status','finished','state',next_state);
END $$;
CREATE FUNCTION app_enrichment_worker_reuse_success(job_uuid uuid,fingerprint text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a public.app_enrichment_source_approvals%ROWTYPE; j public.app_enrichment_jobs%ROWTYPE; frozen uuid[]; granted integer;
BEGIN
 SELECT a0.* INTO a FROM public.app_enrichment_source_approvals a0 JOIN public.app_enrichment_jobs j0 ON j0.approval_id=a0.id WHERE j0.id=job_uuid FOR SHARE OF a0;
 SELECT array_agg(id ORDER BY id) INTO frozen FROM public.app_enrichment_job_candidates WHERE job_id=job_uuid;
 PERFORM public.app_enrichment_worker_lock_candidates(frozen);
 SELECT * INTO j FROM public.app_enrichment_jobs WHERE id=job_uuid FOR UPDATE;
 IF NOT FOUND OR j.state<>'succeeded' THEN RETURN jsonb_build_object('status','unavailable','granted',0); END IF;
 IF NOT a.enabled OR a.approval_revision<>j.approval_revision OR a.configuration_fingerprint<>fingerprint OR fingerprint<>j.configuration_fingerprint THEN RETURN jsonb_build_object('status','approval-conflict','granted',0); END IF;
 INSERT INTO public.app_enrichment_entitlements(snapshot_id,recommendation_id,generation_id,account_id,app_entity_id,observed_binding_revision) SELECT j.completed_snapshot_id,c.recommendation_id,c.generation_id,c.account_id,c.app_entity_id,c.observed_binding_revision FROM public.app_enrichment_job_candidates c WHERE c.id=ANY(frozen) AND c.approval_revision=j.approval_revision AND public.app_enrichment_worker_binding_eligible(c.binding_id,c.generation_id,c.observed_binding_revision) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS granted=ROW_COUNT;
 RETURN jsonb_build_object('status','reused','granted',granted);
END $$;
CREATE FUNCTION app_enrichment_worker_record_run(run_uuid uuid,schedule_identifier text,run_day text,started timestamptz,ended timestamptz,counts jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE k text; required text[]=ARRAY['eligible','processed','unavailable','deferred','exhausted','cancelled','requests','bytes','costUnits','leaseLosses']; day date; receipt_counts jsonb;
BEGIN
 IF run_day !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR jsonb_typeof(counts)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(counts) key) IS DISTINCT FROM ARRAY['budgets','counts']::text[] OR jsonb_typeof(counts->'counts')<>'object' OR (SELECT count(*) FROM jsonb_object_keys(counts->'counts'))<>cardinality(required) OR jsonb_typeof(counts->'budgets')<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(counts->'budgets') key) IS DISTINCT FROM ARRAY['authorityCleanupMs','runtimeMs']::text[] THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invalid sanitized run receipt'; END IF;
 day=run_day::date; IF to_char(day,'YYYY-MM-DD')<>run_day THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invalid UTC run date'; END IF;
 receipt_counts=counts->'counts';
 FOREACH k IN ARRAY required LOOP IF NOT receipt_counts ? k OR jsonb_typeof(receipt_counts->k)<>'number' OR receipt_counts->>k !~ '^[0-9]+$' OR (receipt_counts->>k)::numeric>9007199254740991 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invalid sanitized run count'; END IF; END LOOP;
 FOREACH k IN ARRAY ARRAY['runtimeMs','authorityCleanupMs'] LOOP IF jsonb_typeof(counts->'budgets'->k)<>'number' OR counts->'budgets'->>k !~ '^[0-9]+$' OR (counts->'budgets'->>k)::numeric NOT BETWEEN 1 AND 2147483647 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invalid explicit receipt budget'; END IF; END LOOP;
 IF NOT EXISTS(SELECT 1 FROM public.app_enrichment_worker_run_authorities x WHERE x.id=run_uuid AND x.schedule_id=schedule_identifier AND x.run_date=day AND clock_timestamp()<=x.receipt_deadline_at) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Receipt authority window expired'; END IF;
 INSERT INTO public.app_enrichment_worker_runs(id,schedule_id,run_date,started_at,ended_at,receipt) VALUES(run_uuid,schedule_identifier,day,started,ended,counts);
 RETURN jsonb_build_object('status','recorded');
END $$;

-- Trusted owner receives only the relations needed by these closed operations. UPDATE on
-- owner rows permits FOR UPDATE; none of the entrypoints exposes owner mutation.
GRANT USAGE ON SCHEMA public TO app_enrichment_worker_owner,app_enrichment_worker;
GRANT SELECT,UPDATE ON creator_accounts,recommendations,app_enrichment_bindings,app_enrichment_source_approvals,app_enrichment_worker_run_authorities TO app_enrichment_worker_owner;
GRANT SELECT ON entities,account_category_settings,collections,collection_items,app_enrichment_generations,app_enrichment_generation_retirements TO app_enrichment_worker_owner;
GRANT SELECT,INSERT,UPDATE ON app_enrichment_jobs TO app_enrichment_worker_owner;
GRANT SELECT,INSERT ON app_enrichment_job_candidates,app_enrichment_snapshots,app_enrichment_entitlements,app_enrichment_worker_runs,app_enrichment_worker_run_authorities TO app_enrichment_worker_owner;
GRANT EXECUTE ON FUNCTION app_enrichment_canonical_json(jsonb),app_enrichment_safe_host(text),app_enrichment_immutable_payload() TO app_enrichment_worker_owner;
REVOKE ALL ON app_enrichment_source_approvals,app_enrichment_jobs,app_enrichment_job_candidates,app_enrichment_worker_runs,app_enrichment_worker_run_authorities FROM PUBLIC,music_runtime,app_enrichment_worker;
GRANT SELECT ON app_enrichment_jobs TO app_enrichment_worker;
DO $$ DECLARE f record; signature text; BEGIN
 FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'app_enrichment_worker_%' LOOP
  signature=f.oid::regprocedure::text;
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,music_runtime,app_enrichment_worker',signature);
  EXECUTE format('ALTER FUNCTION %s OWNER TO app_enrichment_worker_owner',signature);
 END LOOP;
END $$;
REVOKE CREATE ON SCHEMA public FROM app_enrichment_worker_owner;
GRANT EXECUTE ON FUNCTION app_enrichment_worker_enroll_run(uuid,text,text,text,text,text,text,bigint,text),app_enrichment_worker_claim(uuid,text,text,text,text,bigint,text),app_enrichment_worker_check_fetch(uuid,uuid,uuid,text),app_enrichment_worker_renew(uuid,uuid,uuid),app_enrichment_worker_complete(uuid,uuid,uuid,text,uuid[],jsonb),app_enrichment_worker_finish_outcome(uuid,uuid,uuid,text,bigint),app_enrichment_worker_reuse_success(uuid,text),app_enrichment_worker_record_run(uuid,text,text,timestamptz,timestamptz,jsonb) TO app_enrichment_worker;

-- Separate bounded history maintenance; no operator policy is seeded.
CREATE TABLE app_enrichment_retention_policy(singleton boolean PRIMARY KEY CHECK(singleton),enabled boolean NOT NULL,revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),policy jsonb NOT NULL);
CREATE FUNCTION app_enrichment_retention_policy_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE keys text[]=ARRAY['retentionDays','maxJobs','maxCandidates','maxRuns','maxAuthorities','maxScanRows','maxRunDates','candidateChunkRows','statementTimeoutMs','lockTimeoutMs','operationTimeoutMs'];k text;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.singleton IS DISTINCT FROM OLD.singleton OR NEW.revision<=OLD.revision) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Retention policy revision must advance';END IF;
 IF jsonb_typeof(NEW.policy)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(NEW.policy))<>cardinality(keys) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Explicit retention policy required';END IF;
 FOREACH k IN ARRAY keys LOOP IF NOT NEW.policy ? k OR jsonb_typeof(NEW.policy->k)<>'number' OR NEW.policy->>k !~ '^[0-9]+$' OR (NEW.policy->>k)::numeric NOT BETWEEN 1 AND 2147483647 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invalid retention ceiling';END IF;END LOOP;
 BEGIN PERFORM clock_timestamp()+(NEW.policy->>'retentionDays')::bigint*interval '1 day';EXCEPTION WHEN datetime_field_overflow OR interval_field_overflow OR numeric_value_out_of_range THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Unsupported retention policy interval';END;
 IF (NEW.policy->>'lockTimeoutMs')::bigint>(NEW.policy->>'statementTimeoutMs')::bigint OR (NEW.policy->>'statementTimeoutMs')::bigint>(NEW.policy->>'operationTimeoutMs')::bigint OR (NEW.policy->>'candidateChunkRows')::bigint>(NEW.policy->>'maxCandidates')::bigint OR EXISTS(SELECT 1 FROM unnest(ARRAY['maxJobs','maxCandidates','maxRuns','maxAuthorities','maxRunDates']) AS t(key) WHERE (NEW.policy->>key)::bigint>(NEW.policy->>'maxScanRows')::bigint) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invalid retention ceiling relationships';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER app_enrichment_retention_policy_guard BEFORE INSERT OR UPDATE ON app_enrichment_retention_policy FOR EACH ROW EXECUTE FUNCTION app_enrichment_retention_policy_guard();
CREATE FUNCTION app_enrichment_retention_cleanup(expected_revision bigint,ceilings jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p public.app_enrichment_retention_policy%ROWTYPE;k text;instant timestamptz=clock_timestamp();cutoff timestamptz;statement_bound bigint;job_window uuid[];candidate_window uuid[];run_window uuid[];authority_window uuid[];date_window date[];fenced_dates date[]=ARRAY[]::date[];d date;locked_jobs uuid[];locked_authorities uuid[];jobs_deleted bigint=0;candidates_deleted bigint=0;runs_deleted bigint=0;authorities_deleted bigint=0;deferred boolean=false;
BEGIN
 SELECT * INTO p FROM public.app_enrichment_retention_policy WHERE singleton;
 IF NOT FOUND OR NOT p.enabled THEN RETURN jsonb_build_object('status','disabled','deleted',jsonb_build_object('jobs',0,'candidates',0,'runs',0,'authorities',0));END IF;
 IF p.revision IS DISTINCT FROM expected_revision OR jsonb_typeof(ceilings)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(ceilings))<>(SELECT count(*) FROM jsonb_object_keys(p.policy)) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Retention policy authority mismatch';END IF;
 FOR k IN SELECT jsonb_object_keys(p.policy) LOOP IF NOT ceilings ? k OR jsonb_typeof(ceilings->k)<>'number' OR ceilings->>k !~ '^[0-9]+$' OR (ceilings->>k)::numeric<1 OR (ceilings->>k)::numeric>(p.policy->>k)::numeric THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Retention ceiling exceeds policy';END IF;END LOOP;
 IF (ceilings->>'retentionDays')::bigint<(p.policy->>'retentionDays')::bigint OR (ceilings->>'lockTimeoutMs')::bigint>(ceilings->>'statementTimeoutMs')::bigint OR (ceilings->>'statementTimeoutMs')::bigint>(ceilings->>'operationTimeoutMs')::bigint OR (ceilings->>'candidateChunkRows')::bigint>(ceilings->>'maxCandidates')::bigint OR EXISTS(SELECT 1 FROM unnest(ARRAY['maxJobs','maxCandidates','maxRuns','maxAuthorities','maxRunDates']) AS t(key) WHERE (ceilings->>key)::bigint>(ceilings->>'maxScanRows')::bigint) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invalid retention call relationships';END IF;
 -- PG15 arms statement_timeout when the command arrives. A SET inside this
 -- function cannot retroactively arm that command; require it established first.
 IF current_query() IS DISTINCT FROM 'SELECT public.app_enrichment_retention_cleanup($1,$2::jsonb) AS result' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Structured standalone retention command required';END IF;
 SELECT setting::bigint INTO statement_bound FROM pg_settings WHERE name='statement_timeout';
 IF statement_bound IS NULL OR statement_bound<=0 OR statement_bound>(ceilings->>'statementTimeoutMs')::bigint THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Pre-established bounded statement timeout required';END IF;
 PERFORM set_config('lock_timeout',ceilings->>'lockTimeoutMs',true);cutoff=instant-(ceilings->>'retentionDays')::bigint*interval '1 day';
 -- Collect every date-bearing window before ANY operational row lock.
 SELECT array_agg(w.id ORDER BY w.terminal_retained_until,w.id) INTO job_window FROM(SELECT id,terminal_retained_until FROM public.app_enrichment_jobs WHERE state IN('succeeded','unavailable','exhausted','cancelled') AND terminal_retained_until<=instant ORDER BY terminal_retained_until,id LIMIT (ceilings->>'maxScanRows')::integer) w;
 SELECT array_agg(w.id ORDER BY w.recorded_at,w.id) INTO run_window FROM(SELECT id,recorded_at FROM public.app_enrichment_worker_runs WHERE recorded_at<=cutoff ORDER BY recorded_at,id LIMIT (ceilings->>'maxScanRows')::integer) w;
 SELECT array_agg(w.id ORDER BY w.receipt_deadline_at,w.id) INTO authority_window FROM(SELECT id,receipt_deadline_at FROM public.app_enrichment_worker_run_authorities WHERE receipt_deadline_at<=cutoff ORDER BY receipt_deadline_at,id LIMIT (ceilings->>'maxScanRows')::integer) w;
 SELECT array_agg(w.run_date ORDER BY w.run_date) INTO date_window FROM(SELECT DISTINCT run_date FROM(SELECT run_date FROM public.app_enrichment_jobs WHERE id=ANY(job_window) UNION ALL SELECT run_date FROM public.app_enrichment_worker_runs WHERE id=ANY(run_window) UNION ALL SELECT run_date FROM public.app_enrichment_worker_run_authorities WHERE id=ANY(authority_window)) dates ORDER BY run_date LIMIT (ceilings->>'maxRunDates')::integer) w;
 PERFORM 1 FROM public.app_enrichment_retention_policy WHERE singleton AND revision=expected_revision AND enabled FOR SHARE;IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Retention policy changed';END IF;
 IF date_window IS NOT NULL THEN FOREACH d IN ARRAY date_window LOOP IF pg_try_advisory_xact_lock(44056,(d-date '2000-01-01')::integer) THEN fenced_dates=array_append(fenced_dates,d);ELSE deferred=true;END IF;END LOOP;END IF;
 -- All authority row locks precede job/candidate locks. Never add a new date later.
 SELECT array_agg(w.id) INTO locked_authorities FROM(SELECT id FROM public.app_enrichment_worker_run_authorities WHERE id=ANY(authority_window) AND run_date=ANY(fenced_dates) AND receipt_deadline_at<=cutoff ORDER BY receipt_deadline_at,id LIMIT (ceilings->>'maxAuthorities')::integer FOR UPDATE SKIP LOCKED) w;
 SELECT array_agg(w.id) INTO locked_jobs FROM(SELECT j.id FROM public.app_enrichment_jobs j WHERE j.id=ANY(job_window) AND j.run_date=ANY(fenced_dates) AND j.run_date<(clock_timestamp() AT TIME ZONE 'UTC')::date AND j.state IN('succeeded','unavailable','exhausted','cancelled') AND j.terminal_retained_until<=instant AND j.terminalized_at<=cutoff AND NOT EXISTS(SELECT 1 FROM public.app_enrichment_worker_run_authorities a WHERE a.run_date=j.run_date AND a.expires_at>clock_timestamp()) ORDER BY j.terminal_retained_until,j.id LIMIT (ceilings->>'maxJobs')::integer FOR UPDATE SKIP LOCKED) w;
 -- Candidates cannot introduce new dates/authority locks. Chunk ACTUAL locked
 -- jobs; an unselected lower UUID must not consume every later call's chunk.
 SELECT array_agg(w.id ORDER BY w.job_id,w.id) INTO candidate_window FROM(SELECT id,job_id FROM public.app_enrichment_job_candidates WHERE job_id=ANY(locked_jobs) ORDER BY job_id,id LIMIT least((ceilings->>'maxScanRows')::integer,(ceilings->>'maxCandidates')::integer,(ceilings->>'candidateChunkRows')::integer)) w;
 DELETE FROM public.app_enrichment_job_candidates WHERE id=ANY(candidate_window) AND job_id=ANY(locked_jobs);GET DIAGNOSTICS candidates_deleted=ROW_COUNT;
 DELETE FROM public.app_enrichment_jobs j WHERE j.id=ANY(locked_jobs) AND NOT EXISTS(SELECT 1 FROM public.app_enrichment_job_candidates c WHERE c.job_id=j.id);GET DIAGNOSTICS jobs_deleted=ROW_COUNT;
 DELETE FROM public.app_enrichment_worker_runs r WHERE r.id IN(SELECT id FROM public.app_enrichment_worker_runs WHERE id=ANY(run_window) AND run_date=ANY(fenced_dates) AND recorded_at<=cutoff ORDER BY recorded_at,id LIMIT (ceilings->>'maxRuns')::integer);GET DIAGNOSTICS runs_deleted=ROW_COUNT;
 DELETE FROM public.app_enrichment_worker_run_authorities a WHERE a.id=ANY(locked_authorities) AND a.receipt_deadline_at<=cutoff AND NOT EXISTS(SELECT 1 FROM public.app_enrichment_worker_runs r WHERE r.id=a.id);GET DIAGNOSTICS authorities_deleted=ROW_COUNT;
 deferred=deferred OR coalesce(cardinality(job_window),0)>jobs_deleted OR coalesce(cardinality(candidate_window),0)>candidates_deleted OR coalesce(cardinality(run_window),0)>runs_deleted OR coalesce(cardinality(authority_window),0)>authorities_deleted;
 RETURN jsonb_build_object('status',CASE WHEN deferred THEN 'deferred' ELSE 'completed' END,'deleted',jsonb_build_object('jobs',jobs_deleted,'candidates',candidates_deleted,'runs',runs_deleted,'authorities',authorities_deleted));
END $$;
GRANT USAGE ON SCHEMA public TO app_enrichment_retention_owner,app_enrichment_retention;
GRANT SELECT,UPDATE ON app_enrichment_retention_policy TO app_enrichment_retention_owner;
GRANT SELECT,UPDATE,DELETE ON app_enrichment_jobs,app_enrichment_worker_run_authorities TO app_enrichment_retention_owner;
GRANT SELECT,DELETE ON app_enrichment_job_candidates,app_enrichment_worker_runs TO app_enrichment_retention_owner;
REVOKE ALL ON app_enrichment_retention_policy FROM PUBLIC,music_runtime,app_enrichment_worker,app_enrichment_retention;
REVOKE ALL ON FUNCTION app_enrichment_retention_policy_guard(),app_enrichment_retention_cleanup(bigint,jsonb) FROM PUBLIC,music_runtime,app_enrichment_worker,app_enrichment_retention;
ALTER FUNCTION app_enrichment_retention_policy_guard() OWNER TO app_enrichment_retention_owner;
ALTER FUNCTION app_enrichment_retention_cleanup(bigint,jsonb) OWNER TO app_enrichment_retention_owner;
REVOKE CREATE ON SCHEMA public FROM app_enrichment_retention_owner;
GRANT EXECUTE ON FUNCTION app_enrichment_retention_cleanup(bigint,jsonb) TO app_enrichment_retention;

-- Forward lifecycle integration: preserve the entire guarded0055purge; remove
-- only this owner's durable candidates before clearing/deleting its generation chain.
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
