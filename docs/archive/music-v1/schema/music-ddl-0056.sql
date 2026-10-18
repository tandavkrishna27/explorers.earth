-- Music v1: flat DDL of every Music database object at migration 0056_explorers_app_enrichment_jobs.
-- Generated 2026-10-18 from a PostgreSQL 15 database migrated with tunes/server/db/migrate.ts at tag music-v1-final.
-- Archive only: this file is never executed. Final function bodies only (the migration history is in tunes/migrations at the tag).
-- Survivors of the Music removal (not dropped by P3): music_schema_migrations, provision_music_runtime_login(name,text),
-- users and the 0001 baseline tables (incl. youtube_music, youtube_music_playlists).

-- ===== Section 1: the ten Music tables (columns, constraints, indexes, table triggers) =====
--
-- PostgreSQL database dump
--






--
-- Name: account_music_identity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_music_identity (
    account_id uuid NOT NULL,
    music_user_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT transaction_timestamp() NOT NULL,
    CONSTRAINT account_music_identity_music_user_id_check CHECK ((music_user_id > 0))
);


--
-- Name: canonical_music_numeric_retirements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.canonical_music_numeric_retirements (
    music_user_id integer NOT NULL,
    account_id uuid NOT NULL,
    lifecycle_operation_id uuid NOT NULL,
    retired_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT canonical_music_numeric_retirements_music_user_id_check CHECK ((music_user_id > 0))
);


--
-- Name: music_credential_revocation_operations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.music_credential_revocation_operations (
    operation_id text NOT NULL,
    music_user_id integer NOT NULL,
    strapi_user_document_id text NOT NULL,
    strapi_account_document_id text NOT NULL,
    reason text NOT NULL,
    expected_session_version integer NOT NULL,
    result_session_version integer NOT NULL,
    operation_state text DEFAULT 'completed'::text NOT NULL,
    completed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT music_credential_revocation_account_check CHECK ((length(strapi_account_document_id) > 0)),
    CONSTRAINT music_credential_revocation_expected_version_check CHECK ((expected_session_version > 0)),
    CONSTRAINT music_credential_revocation_operation_id_check CHECK ((operation_id ~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'::text)),
    CONSTRAINT music_credential_revocation_reason_check CHECK ((reason = ANY (ARRAY['logout_all'::text, 'entitlement_security_revocation'::text, 'credential_compromise'::text]))),
    CONSTRAINT music_credential_revocation_result_version_check CHECK ((result_session_version = (expected_session_version + 1))),
    CONSTRAINT music_credential_revocation_state_check CHECK ((operation_state = 'completed'::text)),
    CONSTRAINT music_credential_revocation_subject_check CHECK ((length(strapi_user_document_id) > 0)),
    CONSTRAINT music_credential_revocation_user_check CHECK ((music_user_id > 0))
);


--
-- Name: TABLE music_credential_revocation_operations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.music_credential_revocation_operations IS 'Durable exact-operation authority for atomic Music session-version revocation';


--
-- Name: music_identity_lifecycle_operations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.music_identity_lifecycle_operations (
    operation_id text NOT NULL,
    strapi_user_document_id text NOT NULL,
    strapi_account_document_id text NOT NULL,
    operation_kind text NOT NULL,
    requested_identity_status text NOT NULL,
    operation_state text DEFAULT 'requested'::text NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    result_session_version integer,
    error_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    operation_phase text DEFAULT 'single'::text NOT NULL,
    music_user_id integer,
    CONSTRAINT music_identity_lifecycle_opera_strapi_account_document_id_check CHECK ((length(strapi_account_document_id) > 0)),
    CONSTRAINT music_identity_lifecycle_operat_requested_identity_status_check CHECK ((requested_identity_status = ANY (ARRAY['active'::text, 'suspended'::text, 'pending_deletion'::text]))),
    CONSTRAINT music_identity_lifecycle_operatio_strapi_user_document_id_check CHECK ((length(strapi_user_document_id) > 0)),
    CONSTRAINT music_identity_lifecycle_operation_result_session_version_check CHECK (((result_session_version IS NULL) OR (result_session_version >= 1))),
    CONSTRAINT music_identity_lifecycle_operations_attempt_count_check CHECK ((attempt_count >= 0)),
    CONSTRAINT music_identity_lifecycle_operations_music_user_id_check CHECK (((music_user_id IS NULL) OR (music_user_id > 0))),
    CONSTRAINT music_identity_lifecycle_operations_operation_id_check CHECK ((length(operation_id) > 0)),
    CONSTRAINT music_identity_lifecycle_operations_operation_kind_check CHECK ((operation_kind = ANY (ARRAY['provision'::text, 'suspend'::text, 'reactivate'::text, 'delete'::text, 'cancel_deletion'::text, 'tombstone'::text]))),
    CONSTRAINT music_identity_lifecycle_operations_operation_phase_check CHECK ((operation_phase = ANY (ARRAY['single'::text, 'prepared'::text, 'finalized'::text]))),
    CONSTRAINT music_identity_lifecycle_operations_operation_state_check CHECK ((operation_state = ANY (ARRAY['requested'::text, 'running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: music_identity_tombstones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.music_identity_tombstones (
    strapi_user_document_id text NOT NULL,
    strapi_account_document_id text NOT NULL,
    reason text NOT NULL,
    lifecycle_operation_id text NOT NULL,
    retention_stage text DEFAULT 'tombstone-retained'::text NOT NULL,
    source_updated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    music_user_id integer,
    CONSTRAINT music_identity_tombstones_lifecycle_operation_id_check CHECK ((length(lifecycle_operation_id) > 0)),
    CONSTRAINT music_identity_tombstones_music_user_id_check CHECK (((music_user_id IS NULL) OR (music_user_id > 0))),
    CONSTRAINT music_identity_tombstones_strapi_account_document_id_check CHECK ((length(strapi_account_document_id) > 0)),
    CONSTRAINT music_identity_tombstones_strapi_user_document_id_check CHECK ((length(strapi_user_document_id) > 0))
);


--
-- Name: music_owner_operations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.music_owner_operations (
    music_user_id integer NOT NULL,
    operation text NOT NULL,
    idempotency_key_hash text NOT NULL,
    request_hash text NOT NULL,
    status_code integer NOT NULL,
    response_body jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT transaction_timestamp() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT music_owner_operations_check CHECK ((expires_at > created_at)),
    CONSTRAINT music_owner_operations_idempotency_key_hash_check CHECK ((idempotency_key_hash ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT music_owner_operations_request_hash_check CHECK ((request_hash ~ '^[a-f0-9]{64}$'::text))
);


--
-- Name: music_publication_operation_archive; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.music_publication_operation_archive (
    music_user_id integer NOT NULL,
    idempotency_key_hash character(64) NOT NULL,
    request_fingerprint character(64) NOT NULL,
    request_mode character varying(16) NOT NULL,
    completed_at timestamp with time zone NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    archived_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT music_publication_operation_archive_check CHECK ((expires_at = (completed_at + '24:00:00'::interval))),
    CONSTRAINT music_publication_operation_archive_check1 CHECK ((archived_at >= expires_at)),
    CONSTRAINT music_publication_operation_archive_idempotency_key_hash_check CHECK ((idempotency_key_hash ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT music_publication_operation_archive_music_user_id_check CHECK ((music_user_id > 0)),
    CONSTRAINT music_publication_operation_archive_request_fingerprint_check CHECK ((request_fingerprint ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT music_publication_operation_archive_request_mode_check CHECK (((request_mode)::text = ANY ((ARRAY['private'::character varying, 'unlisted'::character varying, 'public'::character varying])::text[])))
);


--
-- Name: music_publication_operations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.music_publication_operations (
    music_user_id integer NOT NULL,
    idempotency_key_hash character(64) NOT NULL,
    request_fingerprint character(64) NOT NULL,
    request_mode character varying(16) NOT NULL,
    operation_state character varying(24) NOT NULL,
    created_at timestamp with time zone NOT NULL,
    completed_at timestamp with time zone NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    shredded_at timestamp with time zone,
    response_key_id character varying(64),
    response_nonce bytea,
    response_ciphertext bytea,
    response_tag bytea,
    CONSTRAINT music_publication_operations_check CHECK ((completed_at >= created_at)),
    CONSTRAINT music_publication_operations_check1 CHECK ((expires_at = (completed_at + '24:00:00'::interval))),
    CONSTRAINT music_publication_operations_check2 CHECK ((updated_at >= completed_at)),
    CONSTRAINT music_publication_operations_check3 CHECK (((((operation_state)::text = 'completed'::text) AND (shredded_at IS NULL) AND (response_key_id IS NOT NULL) AND ((response_key_id)::text ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'::text) AND (octet_length(response_nonce) = 12) AND ((octet_length(response_ciphertext) >= 1) AND (octet_length(response_ciphertext) <= 4096)) AND (octet_length(response_tag) = 16)) OR (((operation_state)::text = 'replay_expired'::text) AND (shredded_at IS NOT NULL) AND (response_key_id IS NULL) AND (response_nonce IS NULL) AND (response_ciphertext IS NULL) AND (response_tag IS NULL)))),
    CONSTRAINT music_publication_operations_idempotency_key_hash_check CHECK ((idempotency_key_hash ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT music_publication_operations_music_user_id_check CHECK ((music_user_id > 0)),
    CONSTRAINT music_publication_operations_operation_state_check CHECK (((operation_state)::text = ANY ((ARRAY['completed'::character varying, 'replay_expired'::character varying])::text[]))),
    CONSTRAINT music_publication_operations_request_fingerprint_check CHECK ((request_fingerprint ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT music_publication_operations_request_mode_check CHECK (((request_mode)::text = ANY ((ARRAY['private'::character varying, 'unlisted'::character varying, 'public'::character varying])::text[])))
);


--
-- Name: music_reactivation_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.music_reactivation_tokens (
    token_hash text NOT NULL,
    strapi_user_id bigint NOT NULL,
    strapi_user_document_id text NOT NULL,
    strapi_account_document_id text NOT NULL,
    operation_id uuid NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    lease_owner uuid,
    lease_expires_at timestamp with time zone,
    consumed_at timestamp with time zone,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT music_reactivation_token_expiry_after_issue CHECK ((expires_at > created_at)),
    CONSTRAINT music_reactivation_token_lease_pair CHECK (((lease_owner IS NULL) = (lease_expires_at IS NULL))),
    CONSTRAINT music_reactivation_tokens_strapi_account_document_id_check CHECK (((length(strapi_account_document_id) >= 1) AND (length(strapi_account_document_id) <= 512))),
    CONSTRAINT music_reactivation_tokens_strapi_user_document_id_check CHECK (((length(strapi_user_document_id) >= 1) AND (length(strapi_user_document_id) <= 512))),
    CONSTRAINT music_reactivation_tokens_strapi_user_id_check CHECK ((strapi_user_id > 0)),
    CONSTRAINT music_reactivation_tokens_token_hash_check CHECK ((token_hash ~ '^[a-f0-9]{64}$'::text))
);


--
-- Name: music_request_quota; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.music_request_quota (
    music_user_id integer NOT NULL,
    period_start date NOT NULL,
    accepted_count integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT music_request_quota_accepted_count_check CHECK ((accepted_count >= 0)),
    CONSTRAINT music_request_quota_period_start_check CHECK ((period_start = (date_trunc('month'::text, (period_start)::timestamp with time zone))::date))
);


--
-- Name: account_music_identity account_music_identity_music_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_music_identity
    ADD CONSTRAINT account_music_identity_music_user_id_key UNIQUE (music_user_id);


--
-- Name: account_music_identity account_music_identity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_music_identity
    ADD CONSTRAINT account_music_identity_pkey PRIMARY KEY (account_id);


--
-- Name: canonical_music_numeric_retirements canonical_music_numeric_retirements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canonical_music_numeric_retirements
    ADD CONSTRAINT canonical_music_numeric_retirements_pkey PRIMARY KEY (music_user_id);


--
-- Name: music_credential_revocation_operations music_credential_revocation_operations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.music_credential_revocation_operations
    ADD CONSTRAINT music_credential_revocation_operations_pkey PRIMARY KEY (operation_id);


--
-- Name: music_credential_revocation_operations music_credential_revocation_version_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.music_credential_revocation_operations
    ADD CONSTRAINT music_credential_revocation_version_unique UNIQUE (music_user_id, expected_session_version);


--
-- Name: music_identity_lifecycle_operations music_identity_lifecycle_operations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.music_identity_lifecycle_operations
    ADD CONSTRAINT music_identity_lifecycle_operations_pkey PRIMARY KEY (operation_id);


--
-- Name: music_identity_tombstones music_identity_tombstones_lifecycle_operation_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.music_identity_tombstones
    ADD CONSTRAINT music_identity_tombstones_lifecycle_operation_id_key UNIQUE (lifecycle_operation_id);


--
-- Name: music_identity_tombstones music_identity_tombstones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.music_identity_tombstones
    ADD CONSTRAINT music_identity_tombstones_pkey PRIMARY KEY (strapi_user_document_id);


--
-- Name: music_identity_tombstones music_identity_tombstones_strapi_account_document_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.music_identity_tombstones
    ADD CONSTRAINT music_identity_tombstones_strapi_account_document_id_key UNIQUE (strapi_account_document_id);


--
-- Name: music_owner_operations music_owner_operations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.music_owner_operations
    ADD CONSTRAINT music_owner_operations_pkey PRIMARY KEY (music_user_id, operation, idempotency_key_hash);


--
-- Name: music_publication_operation_archive music_publication_operation_archive_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.music_publication_operation_archive
    ADD CONSTRAINT music_publication_operation_archive_pkey PRIMARY KEY (music_user_id, idempotency_key_hash);


--
-- Name: music_publication_operations music_publication_operations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.music_publication_operations
    ADD CONSTRAINT music_publication_operations_pkey PRIMARY KEY (music_user_id, idempotency_key_hash);


--
-- Name: music_reactivation_tokens music_reactivation_tokens_operation_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.music_reactivation_tokens
    ADD CONSTRAINT music_reactivation_tokens_operation_id_key UNIQUE (operation_id);


--
-- Name: music_reactivation_tokens music_reactivation_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.music_reactivation_tokens
    ADD CONSTRAINT music_reactivation_tokens_pkey PRIMARY KEY (token_hash);


--
-- Name: music_request_quota music_request_quota_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.music_request_quota
    ADD CONSTRAINT music_request_quota_pkey PRIMARY KEY (music_user_id, period_start);


--
-- Name: idx_music_credential_revocation_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_music_credential_revocation_subject ON public.music_credential_revocation_operations USING btree (strapi_user_document_id, strapi_account_document_id);


--
-- Name: idx_music_identity_lifecycle_operations_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_music_identity_lifecycle_operations_identity ON public.music_identity_lifecycle_operations USING btree (strapi_user_document_id, created_at);


--
-- Name: idx_music_identity_operations_music_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_music_identity_operations_music_user_id ON public.music_identity_lifecycle_operations USING btree (music_user_id, operation_kind) WHERE (music_user_id IS NOT NULL);


--
-- Name: idx_music_identity_tombstones_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_music_identity_tombstones_account ON public.music_identity_tombstones USING btree (strapi_account_document_id);


--
-- Name: idx_music_identity_tombstones_music_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_music_identity_tombstones_music_user_id ON public.music_identity_tombstones USING btree (music_user_id) WHERE (music_user_id IS NOT NULL);


--
-- Name: music_owner_operations_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX music_owner_operations_expiry_idx ON public.music_owner_operations USING btree (expires_at, music_user_id, operation);


--
-- Name: music_publication_operation_archive_retention_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX music_publication_operation_archive_retention_idx ON public.music_publication_operation_archive USING btree (archived_at, music_user_id, idempotency_key_hash);


--
-- Name: music_publication_operations_compaction_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX music_publication_operations_compaction_idx ON public.music_publication_operations USING btree (expires_at, music_user_id, idempotency_key_hash) WHERE ((operation_state)::text = 'replay_expired'::text);


--
-- Name: music_publication_operations_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX music_publication_operations_expiry_idx ON public.music_publication_operations USING btree (expires_at, music_user_id, idempotency_key_hash) WHERE (response_ciphertext IS NOT NULL);


--
-- Name: music_reactivation_tokens_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX music_reactivation_tokens_expiry_idx ON public.music_reactivation_tokens USING btree (expires_at) WHERE ((consumed_at IS NULL) AND (revoked_at IS NULL));


--
-- Name: account_music_identity account_music_identity_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER account_music_identity_immutable BEFORE UPDATE ON public.account_music_identity FOR EACH ROW EXECUTE FUNCTION public.reject_account_music_identity_mutation();


--
-- Name: account_music_identity account_music_identity_owner_retained; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER account_music_identity_owner_retained AFTER DELETE ON public.account_music_identity DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.assert_music_venue_owner_retained();


--
-- Name: canonical_music_numeric_retirements canonical_music_numeric_retirement_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER canonical_music_numeric_retirement_immutable BEFORE DELETE OR UPDATE ON public.canonical_music_numeric_retirements FOR EACH ROW EXECUTE FUNCTION public.guard_canonical_music_numeric_retirement();


--
-- Name: canonical_music_numeric_retirements canonical_music_numeric_retirement_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER canonical_music_numeric_retirement_insert BEFORE INSERT ON public.canonical_music_numeric_retirements FOR EACH ROW EXECUTE FUNCTION public.guard_canonical_music_numeric_retirement();


--
-- Name: music_credential_revocation_operations music_credential_revocation_history_immutability; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER music_credential_revocation_history_immutability BEFORE DELETE OR UPDATE ON public.music_credential_revocation_operations FOR EACH ROW EXECUTE FUNCTION public.reject_music_credential_revocation_history_mutation();

ALTER TABLE public.music_credential_revocation_operations ENABLE ALWAYS TRIGGER music_credential_revocation_history_immutability;


--
-- Name: music_identity_tombstones music_identity_tombstone_immutability; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER music_identity_tombstone_immutability BEFORE UPDATE ON public.music_identity_tombstones FOR EACH ROW EXECUTE FUNCTION public.enforce_music_tombstone_immutability();


--
-- Name: music_identity_tombstones music_identity_tombstone_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER music_identity_tombstone_insert BEFORE INSERT ON public.music_identity_tombstones FOR EACH ROW EXECUTE FUNCTION public.enforce_music_tombstone_insert();


--
-- Name: music_identity_lifecycle_operations music_lifecycle_operation_state; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER music_lifecycle_operation_state BEFORE UPDATE ON public.music_identity_lifecycle_operations FOR EACH ROW EXECUTE FUNCTION public.enforce_music_lifecycle_operation_state();


--
-- Name: music_publication_operation_archive music_publication_operation_archive_immutability; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER music_publication_operation_archive_immutability BEFORE DELETE OR UPDATE ON public.music_publication_operation_archive FOR EACH ROW EXECUTE FUNCTION public.reject_music_publication_archive_mutation();

ALTER TABLE public.music_publication_operation_archive ENABLE ALWAYS TRIGGER music_publication_operation_archive_immutability;


--
-- Name: music_publication_operations music_publication_operation_immutability; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER music_publication_operation_immutability BEFORE INSERT OR DELETE OR UPDATE ON public.music_publication_operations FOR EACH ROW EXECUTE FUNCTION public.enforce_music_publication_operation_immutability();

ALTER TABLE public.music_publication_operations ENABLE ALWAYS TRIGGER music_publication_operation_immutability;


--
-- Name: music_reactivation_tokens music_reactivation_token_identity_immutability; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER music_reactivation_token_identity_immutability BEFORE UPDATE ON public.music_reactivation_tokens FOR EACH ROW EXECUTE FUNCTION public.enforce_music_reactivation_token_identity();


--
-- Name: account_music_identity account_music_identity_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_music_identity
    ADD CONSTRAINT account_music_identity_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.creator_accounts(id) ON DELETE RESTRICT;


--
-- Name: account_music_identity account_music_identity_music_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_music_identity
    ADD CONSTRAINT account_music_identity_music_user_id_fkey FOREIGN KEY (music_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: canonical_music_numeric_retirements canonical_music_numeric_retir_lifecycle_operation_id_accou_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canonical_music_numeric_retirements
    ADD CONSTRAINT canonical_music_numeric_retir_lifecycle_operation_id_accou_fkey FOREIGN KEY (lifecycle_operation_id, account_id) REFERENCES public.account_lifecycle_operations(id, account_id) ON DELETE RESTRICT;


--
-- Name: music_identity_tombstones music_identity_tombstone_operation_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.music_identity_tombstones
    ADD CONSTRAINT music_identity_tombstone_operation_fk FOREIGN KEY (lifecycle_operation_id) REFERENCES public.music_identity_lifecycle_operations(operation_id);


--
-- Name: music_owner_operations music_owner_operations_music_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.music_owner_operations
    ADD CONSTRAINT music_owner_operations_music_user_id_fkey FOREIGN KEY (music_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: music_request_quota music_request_quota_music_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.music_request_quota
    ADD CONSTRAINT music_request_quota_music_user_id_fkey FOREIGN KEY (music_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--



-- ===== Section 2: Music triggers on public.users =====
CREATE TRIGGER users_music_identity_immutability BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION enforce_music_identity_immutability();
CREATE TRIGGER users_music_identity_insert BEFORE INSERT ON users FOR EACH ROW EXECUTE FUNCTION enforce_music_identity_insert();
CREATE TRIGGER users_music_numeric_id_immutable BEFORE UPDATE OF id ON users FOR EACH ROW EXECUTE FUNCTION reject_music_numeric_user_id_update();
CREATE CONSTRAINT TRIGGER users_music_venue_owned AFTER INSERT OR UPDATE OF strapi_user_document_id ON users DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_music_venue_owned();
CREATE TRIGGER users_reject_unauthorized_music_identity_delete BEFORE DELETE ON users FOR EACH ROW EXECUTE FUNCTION reject_unauthorized_music_identity_delete();
CREATE TRIGGER users_retain_music_identity_tombstone AFTER DELETE ON users FOR EACH ROW EXECUTE FUNCTION retain_music_identity_tombstone_on_delete();

-- users.lifecycle_operation_id foreign key into music_identity_lifecycle_operations
ALTER TABLE public.users ADD CONSTRAINT users_lifecycle_operation_id_fk FOREIGN KEY (lifecycle_operation_id) REFERENCES music_identity_lifecycle_operations(operation_id);

-- ===== Section 3: Music functions (final bodies) =====
CREATE OR REPLACE FUNCTION public.assert_music_venue_owned()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.strapi_user_document_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.account_music_identity WHERE music_user_id = NEW.id) THEN
    RAISE EXCEPTION 'music venue profile % is unowned: expected a legacy Strapi document id or a canonical account mapping', NEW.id;
  END IF;
  RETURN NULL;
END $function$
;

CREATE OR REPLACE FUNCTION public.assert_music_venue_owner_retained()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Silent when the venue row is going away in the same transaction, which is the
  -- ordinary cascade from deleting the venue itself rather than an orphaning.
  IF EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = OLD.music_user_id
      AND u.strapi_user_document_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.account_music_identity m WHERE m.music_user_id = OLD.music_user_id)
  ) THEN
    RAISE EXCEPTION 'music venue profile % would be left unowned by removing its canonical account mapping', OLD.music_user_id;
  END IF;
  RETURN NULL;
END $function$
;

CREATE OR REPLACE FUNCTION public.enforce_music_identity_immutability()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE operation music_identity_lifecycle_operations%ROWTYPE;
BEGIN
  IF NEW.strapi_user_document_id IS DISTINCT FROM OLD.strapi_user_document_id THEN RAISE EXCEPTION 'immutable strapi_user_document_id'; END IF;
  IF NEW.strapi_account_document_id IS DISTINCT FROM OLD.strapi_account_document_id THEN RAISE EXCEPTION 'immutable strapi_account_document_id'; END IF;
  IF NEW.session_version < OLD.session_version THEN RAISE EXCEPTION 'session_version cannot decrease'; END IF;
  IF NEW.identity_status IS DISTINCT FROM OLD.identity_status THEN
    IF NEW.lifecycle_operation_id IS NOT DISTINCT FROM OLD.lifecycle_operation_id THEN RAISE EXCEPTION 'distinct lifecycle operation required'; END IF;
    SELECT * INTO operation FROM music_identity_lifecycle_operations WHERE operation_id=NEW.lifecycle_operation_id;
    IF NOT FOUND OR operation.strapi_user_document_id IS DISTINCT FROM NEW.strapi_user_document_id
       OR operation.strapi_account_document_id IS DISTINCT FROM NEW.strapi_account_document_id
       OR operation.music_user_id IS DISTINCT FROM NEW.id
       OR operation.requested_identity_status IS DISTINCT FROM NEW.identity_status
       OR operation.operation_state <> 'completed' OR NEW.lifecycle_state <> 'completed' THEN
      RAISE EXCEPTION 'lifecycle operation mismatch';
    END IF;
    IF NOT (
      (OLD.identity_status='active' AND NEW.identity_status='suspended' AND operation.operation_kind='suspend') OR
      (OLD.identity_status='suspended' AND NEW.identity_status='active' AND operation.operation_kind='reactivate') OR
      (OLD.identity_status IN ('active','suspended') AND NEW.identity_status='pending_deletion'
        AND operation.operation_kind='delete' AND operation.operation_phase='prepared') OR
      (OLD.identity_status='pending_deletion' AND NEW.identity_status='suspended' AND operation.operation_kind='cancel_deletion')
    ) THEN RAISE EXCEPTION 'invalid identity lifecycle transition: % -> %', OLD.identity_status, NEW.identity_status; END IF;
    IF (NEW.identity_status='suspended' AND OLD.identity_status='active' OR NEW.identity_status='pending_deletion')
       AND NEW.session_version <= OLD.session_version THEN RAISE EXCEPTION 'session_version must increment for suspension or deletion'; END IF;
  ELSIF NEW.lifecycle_operation_id IS DISTINCT FROM OLD.lifecycle_operation_id THEN
    RAISE EXCEPTION 'lifecycle operation cannot change without identity status';
  END IF;
  IF NEW.guest_capability_hash IS DISTINCT FROM OLD.guest_capability_hash
     AND NEW.guest_capability_rotated_at IS NULL THEN RAISE EXCEPTION 'guest capability rotation metadata required'; END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_music_identity_insert()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE operation music_identity_lifecycle_operations%ROWTYPE;
BEGIN
  PERFORM lock_music_numeric_user_id(NEW.id);
  IF EXISTS (SELECT 1 FROM music_identity_tombstones WHERE music_user_id=NEW.id)
     OR EXISTS (SELECT 1 FROM public.canonical_music_numeric_retirements WHERE music_user_id=NEW.id) THEN
    RAISE EXCEPTION 'numeric Music user ID is retired';
  END IF;
  IF (NEW.strapi_user_document_id IS NULL) <> (NEW.strapi_account_document_id IS NULL) THEN
    RAISE EXCEPTION 'external identity must be complete or absent';
  END IF;
  IF NEW.strapi_user_document_id IS NULL THEN
    RETURN NEW;
  END IF;
  PERFORM lock_music_identity_pair(NEW.strapi_user_document_id, NEW.strapi_account_document_id);
  IF EXISTS (SELECT 1 FROM music_identity_tombstones
             WHERE strapi_user_document_id=NEW.strapi_user_document_id
                OR strapi_account_document_id=NEW.strapi_account_document_id) THEN
    RAISE EXCEPTION 'immutable external identity is tombstoned';
  END IF;
  INSERT INTO music_identity_lifecycle_operations(
    operation_id,strapi_user_document_id,strapi_account_document_id,music_user_id,operation_kind,
    requested_identity_status,operation_state,attempt_count,result_session_version
  ) VALUES (NEW.lifecycle_operation_id,NEW.strapi_user_document_id,NEW.strapi_account_document_id,NEW.id,
    'provision','active','completed',1,NEW.session_version) ON CONFLICT (operation_id) DO NOTHING;
  SELECT * INTO operation FROM music_identity_lifecycle_operations WHERE operation_id=NEW.lifecycle_operation_id;
  IF operation.strapi_user_document_id IS DISTINCT FROM NEW.strapi_user_document_id
     OR operation.strapi_account_document_id IS DISTINCT FROM NEW.strapi_account_document_id
     OR operation.music_user_id IS DISTINCT FROM NEW.id
     OR operation.operation_kind <> 'provision' OR operation.requested_identity_status <> 'active'
     OR operation.operation_state <> 'completed' THEN RAISE EXCEPTION 'lifecycle operation mismatch'; END IF;
  NEW.lifecycle_state := 'completed';
  NEW.lifecycle_attempt_count := GREATEST(NEW.lifecycle_attempt_count,operation.attempt_count);
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_music_lifecycle_operation_state()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.strapi_user_document_id IS DISTINCT FROM OLD.strapi_user_document_id
     OR NEW.strapi_account_document_id IS DISTINCT FROM OLD.strapi_account_document_id
     OR NEW.music_user_id IS DISTINCT FROM OLD.music_user_id
     OR NEW.operation_kind IS DISTINCT FROM OLD.operation_kind
     OR NEW.requested_identity_status IS DISTINCT FROM OLD.requested_identity_status THEN
    RAISE EXCEPTION 'lifecycle operation identity is immutable';
  END IF;
  IF NEW.operation_phase IS DISTINCT FROM OLD.operation_phase AND NOT (
    OLD.operation_kind='delete' AND OLD.operation_state='completed'
    AND OLD.operation_phase='prepared' AND NEW.operation_phase='finalized'
  ) THEN
    RAISE EXCEPTION 'invalid lifecycle operation phase transition: % -> %', OLD.operation_phase, NEW.operation_phase;
  END IF;
  IF NEW.attempt_count < OLD.attempt_count THEN RAISE EXCEPTION 'lifecycle attempt_count cannot decrease'; END IF;
  IF NEW.operation_state IS DISTINCT FROM OLD.operation_state AND NOT (
    (OLD.operation_state = 'requested' AND NEW.operation_state IN ('running','failed','cancelled')) OR
    (OLD.operation_state = 'running' AND NEW.operation_state IN ('completed','failed','cancelled')) OR
    (OLD.operation_state = 'failed' AND NEW.operation_state = 'requested')
  ) THEN RAISE EXCEPTION 'invalid lifecycle operation transition: % -> %', OLD.operation_state, NEW.operation_state; END IF;
  IF (OLD.operation_state = 'requested' AND NEW.operation_state = 'running'
      OR OLD.operation_state = 'failed' AND NEW.operation_state = 'requested')
     AND NEW.attempt_count <> OLD.attempt_count + 1 THEN
    RAISE EXCEPTION 'lifecycle attempt_count must increment for an attempt';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_music_publication_operation_immutability()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.operation_state='replay_expired'
        AND OLD.expires_at<=clock_timestamp()
        AND EXISTS (
          SELECT 1
            FROM public.music_publication_operation_archive archive
           WHERE archive.music_user_id=OLD.music_user_id
             AND archive.idempotency_key_hash=OLD.idempotency_key_hash
             AND archive.request_fingerprint=OLD.request_fingerprint
             AND archive.request_mode=OLD.request_mode
             AND archive.completed_at=OLD.completed_at
             AND archive.expires_at=OLD.expires_at
        ) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'publication operation history is immutable except archived replay-expired deletion';
  END IF;

  IF TG_OP='INSERT' THEN
    IF NEW.operation_state<>'completed' THEN
      RAISE EXCEPTION 'publication operation must begin completed';
    END IF;
    NEW.created_at := transaction_timestamp();
    NEW.completed_at := NEW.created_at;
    NEW.expires_at := NEW.completed_at + interval '24 hours';
    NEW.updated_at := NEW.completed_at;
    RETURN NEW;
  END IF;

  IF NEW.music_user_id IS DISTINCT FROM OLD.music_user_id
      OR NEW.idempotency_key_hash IS DISTINCT FROM OLD.idempotency_key_hash
      OR NEW.request_fingerprint IS DISTINCT FROM OLD.request_fingerprint
      OR NEW.request_mode IS DISTINCT FROM OLD.request_mode
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
      OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    RAISE EXCEPTION 'publication operation identity is immutable';
  END IF;

  IF NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NEW;
  END IF;

  IF OLD.operation_state='completed'
      AND NEW.operation_state='replay_expired'
      AND clock_timestamp() >= OLD.expires_at
      AND OLD.shredded_at IS NULL
      AND NEW.shredded_at IS NOT NULL
      AND NEW.shredded_at >= OLD.expires_at
      AND NEW.response_key_id IS NULL
      AND NEW.response_nonce IS NULL
      AND NEW.response_ciphertext IS NULL
      AND NEW.response_tag IS NULL
      AND NEW.updated_at >= OLD.updated_at THEN
    RETURN NEW;
  END IF;

  IF OLD.operation_state='completed' AND clock_timestamp() < OLD.expires_at THEN
    RAISE EXCEPTION 'publication operation cannot be shredded before response expiry';
  END IF;

  RAISE EXCEPTION 'publication operation history is immutable except one-way response shredding';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_music_reactivation_token_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF NEW.token_hash IS DISTINCT FROM OLD.token_hash
      OR NEW.strapi_user_id IS DISTINCT FROM OLD.strapi_user_id
      OR NEW.strapi_user_document_id IS DISTINCT FROM OLD.strapi_user_document_id
      OR NEW.strapi_account_document_id IS DISTINCT FROM OLD.strapi_account_document_id
      OR NEW.operation_id IS DISTINCT FROM OLD.operation_id
      OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR (OLD.consumed_at IS NOT NULL AND NEW.consumed_at IS DISTINCT FROM OLD.consumed_at)
      OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at) THEN
    RAISE EXCEPTION 'reactivation token authority is immutable';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_music_tombstone_immutability()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.strapi_user_document_id IS DISTINCT FROM OLD.strapi_user_document_id
     OR NEW.strapi_account_document_id IS DISTINCT FROM OLD.strapi_account_document_id
     OR NEW.lifecycle_operation_id IS DISTINCT FROM OLD.lifecycle_operation_id
     OR NEW.music_user_id IS DISTINCT FROM OLD.music_user_id THEN
    RAISE EXCEPTION 'tombstone identity is immutable';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_music_tombstone_insert()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  operation music_identity_lifecycle_operations%ROWTYPE;
  authorized_user_id integer;
BEGIN
  PERFORM lock_music_identity_pair(NEW.strapi_user_document_id, NEW.strapi_account_document_id);
  IF EXISTS (SELECT 1 FROM users
             WHERE strapi_user_document_id=NEW.strapi_user_document_id
                OR strapi_account_document_id=NEW.strapi_account_document_id) THEN
    RAISE EXCEPTION 'live immutable external identity exists';
  END IF;
  authorized_user_id := nullif(current_setting('music.lifecycle_user_id',true),'')::integer;
  IF NEW.music_user_id IS NOT NULL AND NEW.music_user_id IS DISTINCT FROM authorized_user_id THEN
    RAISE EXCEPTION 'numeric Music user ID requires deletion authorization';
  END IF;
  INSERT INTO music_identity_lifecycle_operations(
    operation_id,strapi_user_document_id,strapi_account_document_id,music_user_id,operation_kind,
    requested_identity_status,operation_state,attempt_count,operation_phase
  ) VALUES (NEW.lifecycle_operation_id,NEW.strapi_user_document_id,NEW.strapi_account_document_id,NEW.music_user_id,
    'tombstone','pending_deletion','completed',1,'single') ON CONFLICT (operation_id) DO NOTHING;
  SELECT * INTO operation FROM music_identity_lifecycle_operations WHERE operation_id=NEW.lifecycle_operation_id;
  IF operation.strapi_user_document_id IS DISTINCT FROM NEW.strapi_user_document_id
     OR operation.strapi_account_document_id IS DISTINCT FROM NEW.strapi_account_document_id
     OR operation.music_user_id IS DISTINCT FROM NEW.music_user_id
     OR operation.requested_identity_status <> 'pending_deletion' OR operation.operation_state <> 'completed'
     OR NOT (
       operation.operation_kind='tombstone' AND operation.operation_phase='single'
       OR operation.operation_kind='delete' AND operation.operation_phase IN ('prepared','finalized')
     ) THEN RAISE EXCEPTION 'lifecycle operation mismatch'; END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.finalize_canonical_music_venue_deletion(p_music_user_id integer, p_operation_id text, p_reason text)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
DECLARE identity users%ROWTYPE;
BEGIN
  IF p_music_user_id IS NULL OR p_music_user_id <= 0 THEN RAISE EXCEPTION 'numeric Music user ID is required'; END IF;
  IF p_operation_id IS NULL OR length(p_operation_id)=0 THEN RAISE EXCEPTION 'lifecycle operation ID is required'; END IF;
  IF p_reason IS NULL OR length(p_reason)=0 THEN RAISE EXCEPTION 'release reason is required'; END IF;

  PERFORM lock_music_numeric_user_id(p_music_user_id);
  SELECT * INTO identity FROM users WHERE id=p_music_user_id FOR UPDATE;
  -- Already released. Idempotent so a retried maintenance pass is not an error.
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.canonical_music_numeric_retirements
      WHERE music_user_id=p_music_user_id AND lifecycle_operation_id::text=p_operation_id) THEN RETURN false; END IF;
    RAISE EXCEPTION 'resource-bound canonical retirement history not found';
  END IF;

  IF identity.strapi_user_document_id IS NOT NULL OR identity.strapi_account_document_id IS NOT NULL THEN
    RAISE EXCEPTION 'legacy Music identity requires finalize_music_identity_deletion';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM account_music_identity mi
      JOIN account_lifecycle_operations o ON o.account_id=mi.account_id
      JOIN creator_accounts a ON a.id=o.account_id
     WHERE mi.music_user_id=p_music_user_id
       AND o.id::text=p_operation_id
       AND o.kind='delete'
       AND a.status='pending_deletion'
  ) THEN
    RAISE EXCEPTION 'canonical Music release requires a pending account deletion owning this venue';
  END IF;

  PERFORM set_config('music.lifecycle_delete_authorized','true',true);
  PERFORM set_config('music.lifecycle_operation_id',p_operation_id,true);
  PERFORM set_config('music.lifecycle_user_id',p_music_user_id::text,true);
  PERFORM set_config('music.lifecycle_delete_reason',p_reason,true);

  INSERT INTO public.canonical_music_numeric_retirements(music_user_id,account_id,lifecycle_operation_id)
    SELECT p_music_user_id,mi.account_id,o.id FROM account_music_identity mi
      JOIN account_lifecycle_operations o ON o.account_id=mi.account_id
    WHERE mi.music_user_id=p_music_user_id AND o.id::text=p_operation_id;

  DELETE FROM users WHERE id=p_music_user_id;

  PERFORM set_config('music.lifecycle_delete_authorized','false',true);
  PERFORM set_config('music.lifecycle_user_id','',true);
  PERFORM set_config('music.lifecycle_operation_id','',true);
  PERFORM set_config('music.lifecycle_delete_reason','',true);
  RETURN true;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.finalize_music_identity_deletion(p_user_id integer, p_operation_id text, p_reason text)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
DECLARE
  identity users%ROWTYPE;
  operation music_identity_lifecycle_operations%ROWTYPE;
  tombstone music_identity_tombstones%ROWTYPE;
  next_session_version integer;
BEGIN
  IF p_user_id IS NULL OR p_user_id <= 0 THEN RAISE EXCEPTION 'numeric Music user ID is required'; END IF;
  IF p_operation_id IS NULL OR length(p_operation_id)=0 THEN RAISE EXCEPTION 'lifecycle operation ID is required'; END IF;
  IF p_reason IS NULL OR length(p_reason)=0 THEN RAISE EXCEPTION 'delete reason is required'; END IF;

  SELECT * INTO identity FROM users WHERE id=p_user_id;
  IF NOT FOUND THEN
    SELECT * INTO tombstone FROM music_identity_tombstones WHERE lifecycle_operation_id=p_operation_id;
    SELECT * INTO operation FROM music_identity_lifecycle_operations WHERE operation_id=p_operation_id;
    IF FOUND AND tombstone.lifecycle_operation_id=p_operation_id
       AND tombstone.music_user_id=p_user_id AND operation.music_user_id=p_user_id
       AND operation.operation_kind='delete' AND operation.operation_phase='finalized'
       AND operation.operation_state='completed' THEN
      RETURN false;
    END IF;
    RAISE EXCEPTION 'resource-bound deletion history not found';
  END IF;

  PERFORM lock_music_identity_pair(identity.strapi_user_document_id, identity.strapi_account_document_id);
  PERFORM lock_music_numeric_user_id(p_user_id);
  SELECT * INTO identity FROM users WHERE id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    SELECT * INTO tombstone FROM music_identity_tombstones WHERE lifecycle_operation_id=p_operation_id;
    SELECT * INTO operation FROM music_identity_lifecycle_operations WHERE operation_id=p_operation_id;
    IF FOUND AND tombstone.lifecycle_operation_id=p_operation_id
       AND tombstone.music_user_id=p_user_id AND operation.music_user_id=p_user_id
       AND operation.operation_kind='delete' AND operation.operation_phase='finalized'
       AND operation.operation_state='completed' THEN
      RETURN false;
    END IF;
    RAISE EXCEPTION 'resource-bound deletion history not found';
  END IF;

  SELECT * INTO operation FROM music_identity_lifecycle_operations WHERE operation_id=p_operation_id FOR UPDATE;
  IF NOT FOUND THEN
    next_session_version := identity.session_version + 1;
    INSERT INTO music_identity_lifecycle_operations(
      operation_id,strapi_user_document_id,strapi_account_document_id,music_user_id,operation_kind,
      requested_identity_status,operation_state,attempt_count,result_session_version,operation_phase
    ) VALUES (
      p_operation_id,identity.strapi_user_document_id,identity.strapi_account_document_id,identity.id,'delete',
      'pending_deletion','completed',1,next_session_version,'prepared'
    ) RETURNING * INTO operation;
  ELSE
    IF operation.strapi_user_document_id IS DISTINCT FROM identity.strapi_user_document_id
       OR operation.strapi_account_document_id IS DISTINCT FROM identity.strapi_account_document_id
       OR operation.music_user_id IS DISTINCT FROM identity.id
       OR operation.operation_kind <> 'delete' OR operation.requested_identity_status <> 'pending_deletion'
       OR operation.operation_state <> 'completed' OR operation.operation_phase NOT IN ('prepared','finalized') THEN
      RAISE EXCEPTION 'lifecycle operation mismatch';
    END IF;
    next_session_version := operation.result_session_version;
  END IF;

  IF operation.operation_phase='finalized' THEN
    SELECT * INTO tombstone FROM music_identity_tombstones WHERE lifecycle_operation_id=p_operation_id;
    IF FOUND AND tombstone.music_user_id=p_user_id THEN RETURN false; END IF;
    RAISE EXCEPTION 'finalized lifecycle operation lacks resource-bound tombstone';
  END IF;

  IF identity.identity_status <> 'pending_deletion' THEN
    UPDATE users SET
      identity_status='pending_deletion', session_version=next_session_version,
      lifecycle_operation_id=p_operation_id, lifecycle_state='completed',
      lifecycle_attempt_count=lifecycle_attempt_count+1, lifecycle_last_attempt_at=now(),
      lifecycle_error_code=NULL
    WHERE id=p_user_id
    RETURNING * INTO identity;
  ELSIF identity.lifecycle_operation_id IS DISTINCT FROM p_operation_id
        OR identity.session_version IS DISTINCT FROM operation.result_session_version THEN
    RAISE EXCEPTION 'lifecycle operation mismatch';
  END IF;

  PERFORM set_config('music.lifecycle_delete_authorized','true',true);
  PERFORM set_config('music.lifecycle_operation_id',p_operation_id,true);
  PERFORM set_config('music.lifecycle_user_id',p_user_id::text,true);
  PERFORM set_config('music.lifecycle_delete_reason',p_reason,true);
  DELETE FROM users WHERE id=p_user_id;
  UPDATE music_identity_lifecycle_operations
  SET operation_phase='finalized' WHERE operation_id=p_operation_id;
  RETURN true;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.guard_canonical_music_numeric_retirement()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'canonical Music numeric retirement is immutable';
  END IF;
  PERFORM lock_music_numeric_user_id(NEW.music_user_id);
  IF current_setting('music.lifecycle_delete_authorized',true) IS DISTINCT FROM 'true'
     OR nullif(current_setting('music.lifecycle_user_id',true),'') IS DISTINCT FROM NEW.music_user_id::text
     OR nullif(current_setting('music.lifecycle_operation_id',true),'') IS DISTINCT FROM NEW.lifecycle_operation_id::text
     OR NOT EXISTS (
       SELECT 1 FROM public.users u
       JOIN public.account_music_identity mi ON mi.music_user_id=u.id
       JOIN public.account_lifecycle_operations o ON o.account_id=mi.account_id
       JOIN public.creator_accounts a ON a.id=o.account_id
       WHERE u.id=NEW.music_user_id AND u.strapi_user_document_id IS NULL
         AND u.strapi_account_document_id IS NULL AND mi.account_id=NEW.account_id
         AND o.id=NEW.lifecycle_operation_id AND o.kind='delete'
         AND a.status='pending_deletion'
     ) THEN
    RAISE EXCEPTION 'canonical Music retirement requires authorized owned account deletion';
  END IF;
  NEW.retired_at := clock_timestamp();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.lock_music_identity_pair(user_document_id text, account_document_id text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('music:user:' || user_document_id, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('music:account:' || account_document_id, 0));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.lock_music_numeric_user_id(p_user_id integer)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF p_user_id IS NULL OR p_user_id <= 0 THEN
    RAISE EXCEPTION 'numeric Music user ID is required';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('music:numeric-user:' || p_user_id::text,0));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.music_compact_publication_operations(p_limit integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  candidate record;
  compacted_count integer := 0;
  deleted_count integer;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'publication operation compaction limit is invalid';
  END IF;

  WITH expired_archive AS (
    SELECT archive.music_user_id,archive.idempotency_key_hash
      FROM public.music_publication_operation_archive archive
     WHERE archive.archived_at<=clock_timestamp()-interval '30 days'
     ORDER BY archive.archived_at,archive.music_user_id,archive.idempotency_key_hash
     LIMIT p_limit
     FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.music_publication_operation_archive archive
   USING expired_archive
   WHERE archive.music_user_id=expired_archive.music_user_id
     AND archive.idempotency_key_hash=expired_archive.idempotency_key_hash;
  GET DIAGNOSTICS compacted_count = ROW_COUNT;

  FOR candidate IN
    SELECT operation.music_user_id,operation.idempotency_key_hash,
           operation.request_fingerprint,operation.request_mode,
           operation.completed_at,operation.expires_at
      FROM public.music_publication_operations operation
     WHERE operation.operation_state='replay_expired'
       AND operation.expires_at<=clock_timestamp()
     ORDER BY operation.expires_at,operation.music_user_id,operation.idempotency_key_hash
     LIMIT GREATEST(p_limit-compacted_count,0)
     FOR UPDATE SKIP LOCKED
  LOOP
    INSERT INTO public.music_publication_operation_archive(
      music_user_id,idempotency_key_hash,request_fingerprint,request_mode,
      completed_at,expires_at,archived_at
    ) VALUES (
      candidate.music_user_id,candidate.idempotency_key_hash,
      candidate.request_fingerprint,candidate.request_mode,
      candidate.completed_at,candidate.expires_at,clock_timestamp()
    ) ON CONFLICT (music_user_id,idempotency_key_hash) DO NOTHING;

    DELETE FROM public.music_publication_operations operation
     WHERE operation.music_user_id=candidate.music_user_id
       AND operation.idempotency_key_hash=candidate.idempotency_key_hash
       AND EXISTS (
         SELECT 1
           FROM public.music_publication_operation_archive archive
          WHERE archive.music_user_id=operation.music_user_id
            AND archive.idempotency_key_hash=operation.idempotency_key_hash
            AND archive.request_fingerprint=operation.request_fingerprint
            AND archive.request_mode=operation.request_mode
            AND archive.completed_at=operation.completed_at
            AND archive.expires_at=operation.expires_at
       );
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    compacted_count := compacted_count + deleted_count;
  END LOOP;

  RETURN compacted_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.music_lookup_publication_operation_archive(p_music_user_id integer, p_idempotency_key_hash text)
 RETURNS TABLE(request_fingerprint text, request_mode text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT archive.request_fingerprint::text, archive.request_mode::text
    FROM public.music_publication_operation_archive archive
   WHERE p_music_user_id > 0
     AND p_idempotency_key_hash ~ '^[a-f0-9]{64}$'
     AND archive.music_user_id=p_music_user_id
     AND archive.idempotency_key_hash=p_idempotency_key_hash
$function$
;

CREATE OR REPLACE FUNCTION public.provision_music_runtime_login(p_login_role name, p_password text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE login_attributes record;
BEGIN
  IF p_login_role::text !~ '^[a-z_][a-z0-9_]{1,62}$'
      OR p_login_role::text IN ('postgres','music_runtime',current_user) THEN
    RAISE EXCEPTION 'runtime login role is invalid';
  END IF;
  IF length(p_password) < 43 OR length(p_password) > 256 OR p_password !~ '^[A-Za-z0-9_-]+$' THEN
    RAISE EXCEPTION 'runtime login credential is invalid';
  END IF;

  SELECT rolcanlogin, rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls
    INTO login_attributes FROM pg_roles WHERE rolname=p_login_role;
  IF NOT FOUND THEN
    EXECUTE format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS PASSWORD %L',
      p_login_role, p_password);
  ELSE
    IF NOT login_attributes.rolcanlogin OR login_attributes.rolsuper OR login_attributes.rolcreaterole
        OR login_attributes.rolcreatedb OR login_attributes.rolreplication OR login_attributes.rolbypassrls THEN
      RAISE EXCEPTION 'existing runtime login role has unsafe attributes';
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_auth_members memberships
      JOIN pg_roles granted_role ON granted_role.oid=memberships.roleid
      JOIN pg_roles login_role ON login_role.oid=memberships.member
      WHERE login_role.rolname=p_login_role AND granted_role.rolname<>'music_runtime'
    ) THEN
      RAISE EXCEPTION 'existing runtime login role has unsafe membership';
    END IF;
    EXECUTE format('ALTER ROLE %I NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS PASSWORD %L',
      p_login_role, p_password);
  END IF;
  EXECUTE format('GRANT music_runtime TO %I', p_login_role);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reject_account_music_identity_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'canonical Music mapping is immutable';
END $function$
;

CREATE OR REPLACE FUNCTION public.reject_music_credential_revocation_history_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'credential revocation history is immutable';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reject_music_numeric_user_id_update()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'numeric Music user ID is immutable'; END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reject_music_publication_archive_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF TG_OP='DELETE' AND OLD.archived_at<=clock_timestamp()-interval '30 days' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'publication operation archive is immutable within retention';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reject_unauthorized_music_identity_delete()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF current_setting('music.lifecycle_delete_authorized',true) IS DISTINCT FROM 'true'
     OR nullif(current_setting('music.lifecycle_operation_id',true),'') IS NULL
     OR nullif(current_setting('music.lifecycle_user_id',true),'')::integer IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'direct user delete forbidden; use finalize_music_identity_deletion';
  END IF;
  RETURN OLD;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.retain_music_identity_tombstone_on_delete()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  requested_operation_id text;
  requested_reason text;
BEGIN
  IF OLD.strapi_user_document_id IS NULL AND OLD.strapi_account_document_id IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.canonical_music_numeric_retirements
      WHERE music_user_id=OLD.id
        AND lifecycle_operation_id::text=nullif(current_setting('music.lifecycle_operation_id',true),'')) THEN
      RAISE EXCEPTION 'canonical Music deletion requires numeric retirement evidence';
    END IF;
    RETURN OLD;
  END IF;
  requested_operation_id := nullif(current_setting('music.lifecycle_operation_id',true),'');
  requested_reason := nullif(current_setting('music.lifecycle_delete_reason',true),'');
  INSERT INTO music_identity_tombstones(
    strapi_user_document_id,strapi_account_document_id,music_user_id,reason,lifecycle_operation_id
  ) VALUES (
    OLD.strapi_user_document_id,OLD.strapi_account_document_id,OLD.id,
    coalesce(requested_reason,'database-delete'),requested_operation_id
  );
  RETURN OLD;
END;
$function$
;

