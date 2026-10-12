-- Apps owner acceptance storage. Shared purge/role/chain integration is serialized by root.
-- No provider registry, worker, display invalidation trigger, schedule or TTL is installed here.
--
-- WRITERS MUST PARSE FIRST. Every guard below REFUSES a non-conforming payload; none of them
-- normalises one. A writer that inserts into app_enrichment_snapshots must run the value
-- through appSnapshotSchema (shared/explorersAppEnrichmentContract.ts) and re-hash it before
-- the INSERT. Storage will not trim, case-fold, re-format a timestamp or canonicalise a UUID
-- on anybody's behalf, and these rows are immutable, so a refused write is the only outcome
-- that is still recoverable.
--
-- The octet_length bound below and the lone-surrogate dismissal at the text-parity note both
-- presuppose a UTF-8 server encoding: in SQL_ASCII there is no input validation, so a WTF-8
-- byte sequence encoding a lone surrogate would reach the contract's own surrogate refine and
-- poison an immutable row. Assert the encoding instead of assuming it, so a cluster that
-- cannot honour the reasoning fails here, loudly, at migration time.
DO $$ BEGIN
 IF current_setting('server_encoding')<>'UTF8' THEN
  RAISE EXCEPTION USING ERRCODE='0A000',MESSAGE='Apps enrichment storage requires a UTF8 server encoding';
 END IF;
END $$;
CREATE TABLE app_enrichment_bindings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL,
 recommendation_id uuid NOT NULL UNIQUE, category text NOT NULL DEFAULT 'apps' CHECK(category='apps'),
 app_entity_id uuid NOT NULL, kind text NOT NULL DEFAULT 'app' CHECK(kind='app'),
 opt_in boolean NOT NULL, binding_revision bigint NOT NULL DEFAULT 1 CHECK(binding_revision BETWEEN 1 AND 9007199254740991),
 current_generation_id uuid,
 UNIQUE(id,account_id,recommendation_id),
 FOREIGN KEY(recommendation_id,account_id,category) REFERENCES recommendations(id,account_id,category) ON DELETE RESTRICT,
 FOREIGN KEY(app_entity_id,kind) REFERENCES entities(id,kind) ON DELETE RESTRICT
);
CREATE TABLE app_enrichment_generations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), binding_id uuid NOT NULL,
 account_id uuid NOT NULL, recommendation_id uuid NOT NULL, app_entity_id uuid NOT NULL,
 kind text NOT NULL DEFAULT 'app' CHECK(kind='app'),
 -- Text bounds use octet_length, not length. The shared contract bounds these labels with
 -- zod .max(), which counts UTF-16 code units; length() counts characters, so astral-plane
 -- text passes a character bound and fails the contract. For UTF-8 every character costs at
 -- least as many bytes as it costs UTF-16 units, so octet_length<=N implies utf16<=N. This is
 -- deliberately STRICTER than the contract for multi-byte text: refusing a lawful write is
 -- loud and recoverable, admitting a row the contract can never read is silent and permanent
 -- (these rows are immutable, so an unreadable row cannot be repaired by UPDATE).
 source_id text NOT NULL CHECK(octet_length(source_id) BETWEEN 1 AND 2048),
 source_identity text NOT NULL CHECK(octet_length(source_identity) BETWEEN 1 AND 2048),
 source_identity_hash text NOT NULL CHECK(source_identity_hash ~ '^[a-f0-9]{64}$'),
 canonicalization_version text NOT NULL CHECK(octet_length(canonicalization_version) BETWEEN 1 AND 2048),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(id,binding_id,account_id,recommendation_id,app_entity_id),
 UNIQUE(id,account_id,recommendation_id,app_entity_id),
 FOREIGN KEY(binding_id,account_id,recommendation_id) REFERENCES app_enrichment_bindings(id,account_id,recommendation_id) ON DELETE RESTRICT,
 FOREIGN KEY(app_entity_id,kind) REFERENCES entities(id,kind) ON DELETE RESTRICT
);
ALTER TABLE app_enrichment_bindings ADD CONSTRAINT app_enrichment_current_generation_fk
 FOREIGN KEY(current_generation_id,id,account_id,recommendation_id,app_entity_id)
 REFERENCES app_enrichment_generations(id,binding_id,account_id,recommendation_id,app_entity_id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE app_enrichment_generation_retirements (
 generation_id uuid PRIMARY KEY REFERENCES app_enrichment_generations(id) ON DELETE RESTRICT,
 retired_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE app_enrichment_snapshots (
 id uuid PRIMARY KEY, app_entity_id uuid NOT NULL,
 kind text NOT NULL DEFAULT 'app' CHECK(kind='app'),
 -- Same octet_length rationale as app_enrichment_generations above.
 source_id text NOT NULL CHECK(octet_length(source_id) BETWEEN 1 AND 2048),
 source_identity text NOT NULL CHECK(octet_length(source_identity) BETWEEN 1 AND 2048),
 source_identity_hash text NOT NULL CHECK(source_identity_hash ~ '^[a-f0-9]{64}$'),
 canonicalization_version text NOT NULL CHECK(octet_length(canonicalization_version) BETWEEN 1 AND 2048),
 fetched_at timestamptz NOT NULL, payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 UNIQUE(id,app_entity_id),
 FOREIGN KEY(app_entity_id,kind) REFERENCES entities(id,kind) ON DELETE RESTRICT
);
CREATE TABLE app_enrichment_entitlements (
 snapshot_id uuid NOT NULL, recommendation_id uuid NOT NULL, generation_id uuid NOT NULL,
 account_id uuid NOT NULL, app_entity_id uuid NOT NULL,
 observed_binding_revision bigint NOT NULL CHECK(observed_binding_revision BETWEEN 1 AND 9007199254740991),
 PRIMARY KEY(snapshot_id,recommendation_id,generation_id),
 UNIQUE(snapshot_id,recommendation_id,generation_id,account_id),
 FOREIGN KEY(generation_id,account_id,recommendation_id,app_entity_id) REFERENCES app_enrichment_generations(id,account_id,recommendation_id,app_entity_id) ON DELETE RESTRICT,
 FOREIGN KEY(snapshot_id,app_entity_id) REFERENCES app_enrichment_snapshots(id,app_entity_id) ON DELETE RESTRICT
);
CREATE TABLE app_enrichment_acceptances (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL,
 recommendation_id uuid NOT NULL, snapshot_id uuid NOT NULL, generation_id uuid NOT NULL,
 selected_fields text[] NOT NULL, accepted_values jsonb NOT NULL CHECK(jsonb_typeof(accepted_values)='object'),
 actor_user_id uuid NOT NULL, receipt_id uuid NOT NULL UNIQUE,
 accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(snapshot_id,recommendation_id,generation_id,account_id) REFERENCES app_enrichment_entitlements(snapshot_id,recommendation_id,generation_id,account_id) ON DELETE RESTRICT,
 FOREIGN KEY(receipt_id) REFERENCES application_command_receipts(id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX app_enrichment_owner_idx ON app_enrichment_bindings(account_id,recommendation_id);
CREATE INDEX app_enrichment_snapshot_source_idx ON app_enrichment_snapshots(app_entity_id,source_id,source_identity_hash,fetched_at,id);
CREATE INDEX app_enrichment_entitlement_owner_idx ON app_enrichment_entitlements(account_id,recommendation_id,generation_id);

CREATE FUNCTION app_enrichment_immutable_payload() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Immutable Apps enrichment payload'; END $$;
CREATE TRIGGER app_enrichment_generation_immutable BEFORE UPDATE ON app_enrichment_generations FOR EACH ROW EXECUTE FUNCTION app_enrichment_immutable_payload();
CREATE TRIGGER app_enrichment_retirement_immutable BEFORE UPDATE ON app_enrichment_generation_retirements FOR EACH ROW EXECUTE FUNCTION app_enrichment_immutable_payload();
CREATE TRIGGER app_enrichment_snapshot_immutable BEFORE UPDATE ON app_enrichment_snapshots FOR EACH ROW EXECUTE FUNCTION app_enrichment_immutable_payload();
CREATE TRIGGER app_enrichment_entitlement_immutable BEFORE UPDATE ON app_enrichment_entitlements FOR EACH ROW EXECUTE FUNCTION app_enrichment_immutable_payload();
CREATE TRIGGER app_enrichment_acceptance_immutable BEFORE UPDATE ON app_enrichment_acceptances FOR EACH ROW EXECUTE FUNCTION app_enrichment_immutable_payload();

CREATE FUNCTION app_enrichment_binding_identity() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='UPDATE' AND ROW(NEW.id,NEW.account_id,NEW.recommendation_id,NEW.category,NEW.kind) IS DISTINCT FROM ROW(OLD.id,OLD.account_id,OLD.recommendation_id,OLD.category,OLD.kind) THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Immutable Apps binding identity';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.recommendations r JOIN public.entities e ON e.id=r.entity_id WHERE r.id=NEW.recommendation_id AND r.account_id=NEW.account_id AND r.category='apps' AND r.entity_id=NEW.app_entity_id AND e.kind='app' AND e.origin='manual') THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Apps binding identity mismatch';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER app_enrichment_binding_identity_guard BEFORE INSERT OR UPDATE ON app_enrichment_bindings FOR EACH ROW EXECUTE FUNCTION app_enrichment_binding_identity();
CREATE FUNCTION app_enrichment_current_generation_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE binding_uuid uuid; b public.app_enrichment_bindings%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='app_enrichment_bindings' THEN binding_uuid=NEW.id;
 ELSE SELECT binding_id INTO binding_uuid FROM public.app_enrichment_generations WHERE id=NEW.generation_id; END IF;
 SELECT * INTO b FROM public.app_enrichment_bindings WHERE id=binding_uuid;
 IF FOUND AND b.current_generation_id IS NOT NULL AND (EXISTS(SELECT 1 FROM public.app_enrichment_generation_retirements WHERE generation_id=b.current_generation_id) OR NOT EXISTS(SELECT 1 FROM public.app_enrichment_generations g WHERE g.id=b.current_generation_id AND g.binding_id=b.id AND g.account_id=b.account_id AND g.recommendation_id=b.recommendation_id AND g.app_entity_id=b.app_entity_id)) THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Apps current generation mismatch';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER app_enrichment_binding_current_guard AFTER INSERT OR UPDATE ON app_enrichment_bindings DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_enrichment_current_generation_guard();
CREATE CONSTRAINT TRIGGER app_enrichment_retired_current_guard AFTER INSERT ON app_enrichment_generation_retirements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_enrichment_current_generation_guard();

-- Canonical JSON for this string/null/array snapshot domain; PostgreSQL JSONB textual spacing is not a hash authority.
CREATE FUNCTION app_enrichment_canonical_json(value jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog,public AS $$
DECLARE result text;
BEGIN
 IF jsonb_typeof(value)='object' THEN SELECT '{'||coalesce(string_agg(to_json(key)::text||':'||public.app_enrichment_canonical_json(val),',' ORDER BY key COLLATE "C"),'')||'}' INTO result FROM jsonb_each(value) e(key,val);
 ELSIF jsonb_typeof(value)='array' THEN SELECT '['||coalesce(string_agg(public.app_enrichment_canonical_json(val),',' ORDER BY ord),'')||']' INTO result FROM jsonb_array_elements(value) WITH ORDINALITY e(val,ord);
 ELSE result=value::text; END IF;
 RETURN result;
END $$;
-- TEXT DOMAIN PARITY WITH THE SHARED CONTRACT (deliberately strict; see 0055 notes above).
-- 1. Trim domain. The contract normalizes every guarded text field with zod .string().trim(),
--    which strips the full ECMAScript WhiteSpace+LineTerminator set, not just U+0020. btrim/1
--    strips SPACES ONLY, so a value ending in a tab satisfied btrim and still differed from
--    its contract-trimmed form; because the snapshot contentHash is computed over the RAW
--    payload here and over the TRIMMED payload in the contract, such a row hashed clean on
--    insert and then failed the read-side hash comparison forever. These tables are immutable,
--    so that row could not be repaired, and one poisoned row denied the owner's entire
--    suggestion list. app_enrichment_trim_edge below therefore refuses any value whose first
--    or last character could be trimmed. It is the UNION of the explicit ECMAScript trim set
--    and the locale [:space:] class. Only the SUPERSET property is ctype-independent, and that
--    is the property this guard needs: the explicit set alone already covers everything the
--    contract strips, so adding [:space:] can only ever refuse MORE, never less, whatever the
--    cluster ctype resolves it to. WHICH additionally-lawful values get refused is NOT fixed:
--    under a glibc UTF-8 locale [:space:] also matches U+0085, which appTitleSchema permits.
--    So SQL stays stricter than the contract in every ctype; the exact strictness varies.
-- 2. Length units. Bounds use octet_length for the same UTF-16-vs-character reason recorded on
--    the table definitions. The contract's title bound is additionally a code-POINT bound
--    (<=500) under a 1000 UTF-16 cap; octet_length<=500 implies both.
-- 3. Control characters. Every clause now names explicit chr() ranges. The previous title clause
--    used ~ '[[:cntrl:]]', which resolves through the database ctype and in a glibc UTF-8 locale
--    also matches C1 (U+0080-U+009F) that appTitleSchema permits, making an immutable guard's
--    behaviour cluster-dependent. Title forbids every C0 plus U+007F (the contract's title
--    refine); description and platform members permit interior TAB/LF/CR (the contract's text()
--    refine). Lone surrogates need no clause: UTF-8 input rejects them before this guard runs,
--    which is why the UTF8 assertion at the head of this migration is not optional.
-- 4. Formatted scalars. A ::uuid or ::timestamptz CAST IS NOT A FORMAT CHECK. PostgreSQL's uuid
--    input also accepts brace-wrapped and unhyphenated spellings. It does NOT, however, skip
--    surrounding whitespace (measured: SELECT $1::uuid refuses both a lead- and a trail-padded
--    spelling with 22P02), so a space-padded uuid was never a cast-only gap on the uuid side:
--    the id columns refuse it at Bind, BEFORE the payload regex is ever consulted. That refusal
--    is real and deterministic, just EARLIER than this note once claimed; the payload regex was
--    verified independently to refuse the same spellings, so neither layer relies on the other.
--    The datetime input is the lax one for whitespace: it skips surrounding whitespace, and also
--    takes a space separator, lowercase t/z and a bare +HH offset.
--    contentIdSchema is z.string().uuid() and the contract's timestamp is
--    z.string().datetime({offset:true}), all of which refuse those spellings. Because the
--    contentHash is computed over the RAW payload, a cast-only clause admitted an immutable row
--    whose every later read through appSnapshotSchema threw, denying the owner's whole
--    suggestion list. app_enrichment_uuid and app_enrichment_instant below pin the SPELLING
--    before the cast, and the casts stay so that a well-formed but nonexistent instant still
--    fails. TWO such instants are well-formed to the regex and are refused by the retained cast,
--    so they are the only guarded values here that raise 22008 (datetime_field_overflow) rather
--    than 23514: a non-leap 29 February (the residue the month-length grammar cannot express)
--    and year zero, '0000-01-01T00:00:00Z' (PostgreSQL has no year 0). Both were measured as
--    22008; 22P02 is the uuid side's code, not the datetime side's. Both are deliberate, both
--    refuse in the safe direction, and a reader expecting 23514 everywhere should expect 22008
--    for exactly these two.
--    The grammars were derived by probing the actual schemas, not from memory:
--      uuid    - 8-4-4-4-12 hex, case-insensitive, version and variant nibbles UNCONSTRAINED
--                (zod v3 accepts every hex nibble there, so this pattern must not refuse them).
--      instant - YYYY-MM-DDTHH:MM:SS[.frac]{Z|+HH:MM|-HH:MM}, literal uppercase T and Z, month
--                length enforced, hour 00-23, minute/second 00-59, any number of fraction
--                digits. THREE contract-lawful shapes are refused here, all strictness in the
--                safe direction: a +HHMM (colon-less) offset, offset hour 24, and MINUTE
--                precision with no seconds ('2024-01-02T03:04Z'). The third matters most to a
--                writer: a toISOString()-style producer never emits it, while a producer that
--                emits minute-precision ISO hits this refusal on EVERY row, loudly, at insert.
-- 5. sourceUrl host. safeAppUrlSchema resolves the authority through the WHATWG URL parser,
--    which refuses hosts a character class admits: a percent sign that is not a valid escape,
--    an empty or malformed bracketed literal, and a dotted host whose last label is numeric but
--    not a legal IPv4 address. Those were the same immutable-poisoning shape, so the authority
--    is now checked by app_enrichment_safe_host as well as by the structural regex.
CREATE FUNCTION app_enrichment_safe_host(authority text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog,public AS $$
DECLARE literal text;
BEGIN
 IF left(authority,1)='[' THEN
  IF right(authority,1)<>']' THEN RETURN false; END IF;
  literal=substring(authority from 2 for length(authority)-2);
  -- An actual single IPv6 address, not merely hex and colons: inet refuses '[]' and '[a:b:c]'.
  BEGIN RETURN family(literal::inet)=6 AND masklen(literal::inet)=128; EXCEPTION WHEN others THEN RETURN false; END;
 END IF;
 -- Either a dotted quad with 0-255 octets, or an ASCII label sequence whose last label is not
 -- all digits (an all-digit last label makes the parser read the whole host as IPv4). Neither
 -- branch admits '%', so no invalid percent-escape can reach the parser.
 -- POLICY: this is an ALLOW-LIST, so the refused-but-contract-lawful set is wider than the
 -- percent-escaped and internationalised hosts named above. It also refuses trailing-dot FQDNs
 -- ('a.com.'), empty labels ('a..com', '.a.com'), leading-zero/octal/hex/short-form IPv4
 -- ('01.2.3.4', '0x7f.1', '1.2.3'), bare single-number hosts ('12345'), and authorities
 -- containing a backslash or a TAB that the WHATWG parser strips and then parses fine. Every
 -- one of those is a loud refusal at insert, never a silently poisoned immutable row.
 -- MITIGATION (load-bearing, do not drop): an A-label IS admitted -
 -- 'xn--bcher-kva.example' passes this function. So every internationalised source remains
 -- REPRESENTABLE by pre-punycoding the authority, which is what a WHATWG-conformant writer
 -- produces anyway. The policy is therefore "the writer must emit the A-label", not "a
 -- non-ASCII source can never be approved"; approving such a source needs no change here.
 RETURN authority ~ '^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])[.]){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])$'
  OR authority ~ '^([0-9a-z_-]+[.])*[0-9a-z_-]*[a-z_-][0-9a-z_-]*$';
END $$;
CREATE FUNCTION app_enrichment_snapshot_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE p jsonb=NEW.payload; k text; v jsonb; provenance jsonb; platform jsonb;
 app_enrichment_uuid text='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
 app_enrichment_instant text='^[0-9]{4}-((0[13578]|1[02])-(0[1-9]|[12][0-9]|3[01])|(0[469]|11)-(0[1-9]|[12][0-9]|30)|02-(0[1-9]|1[0-9]|2[0-9]))T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]([.][0-9]+)?(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$';
 app_enrichment_trim_ws text=chr(9)||'-'||chr(13)||chr(32)||chr(160)||chr(5760)||chr(8192)||'-'||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279);
 app_enrichment_trim_edge text='(^['||app_enrichment_trim_ws||'[:space:]]|['||app_enrichment_trim_ws||'[:space:]]$)';
 app_enrichment_text_cntrl text='['||chr(1)||'-'||chr(8)||chr(11)||chr(12)||chr(14)||'-'||chr(31)||chr(127)||']';
 app_enrichment_title_cntrl text='['||chr(1)||'-'||chr(31)||chr(127)||']';
BEGIN
 -- Spelling before casting, and in a STATEMENT of its own: PostgreSQL does not promise an
 -- evaluation order for OR operands, so a regex placed beside the cast in one condition is not
 -- guaranteed to run first. This also keeps the failure a 23514 instead of a cast's 22P02.
 IF jsonb_typeof(p->'snapshotId')<>'string' OR p->>'snapshotId' !~ app_enrichment_uuid
 OR jsonb_typeof(p->'appEntityId')<>'string' OR p->>'appEntityId' !~ app_enrichment_uuid
 OR jsonb_typeof(p->'fetchedAt')<>'string' OR p->>'fetchedAt' !~ app_enrichment_instant THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Apps snapshot provenance mismatch';
 END IF;
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p) e(key)) IS DISTINCT FROM ARRAY['adapterVersion','appEntityId','canonicalizationVersion','contentHash','fetchedAt','fieldProvenance','fields','snapshotId','sourceId','sourceIdentity','sourceIdentityHash']::text[]
 OR (p->>'snapshotId')::uuid<>NEW.id OR (p->>'appEntityId')::uuid<>NEW.app_entity_id
 OR EXISTS(SELECT 1 FROM jsonb_each(p) WHERE key NOT IN ('fields','fieldProvenance') AND jsonb_typeof(value)<>'string')
 OR p->>'sourceId'<>NEW.source_id OR p->>'sourceIdentity'<>NEW.source_identity
 OR p->>'sourceIdentityHash'<>NEW.source_identity_hash OR p->>'canonicalizationVersion'<>NEW.canonicalization_version
 OR jsonb_typeof(p->'adapterVersion')<>'string' OR octet_length(p->>'adapterVersion') NOT BETWEEN 1 AND 2048
 OR jsonb_typeof(p->'fetchedAt')<>'string' OR (p->>'fetchedAt')::timestamptz<>NEW.fetched_at
 OR jsonb_typeof(p->'fields')<>'object' OR jsonb_typeof(p->'fieldProvenance')<>'object'
 OR p->>'contentHash' IS DISTINCT FROM encode(sha256(convert_to(public.app_enrichment_canonical_json(p-'snapshotId'-'contentHash'),'UTF8')),'hex') THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Apps snapshot provenance mismatch';
 END IF;
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p->'fields') e(key)) IS DISTINCT FROM (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p->'fieldProvenance') e(key)) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Apps snapshot fields mismatch'; END IF;
 FOR k,v IN SELECT key,value FROM jsonb_each(p->'fields') LOOP
  IF k NOT IN ('title','description','priceTier','platforms') THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Unknown Apps snapshot field'; END IF;
  IF k='title' AND (jsonb_typeof(v)<>'string' OR octet_length(v#>>'{}') NOT BETWEEN 1 AND 500 OR (v#>>'{}') ~ app_enrichment_trim_edge OR (v#>>'{}') ~ app_enrichment_title_cntrl) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invalid Apps snapshot title'; END IF;
  IF k='description' AND v<>'null'::jsonb AND (jsonb_typeof(v)<>'string' OR octet_length(v#>>'{}')>8192 OR (v#>>'{}') ~ app_enrichment_trim_edge OR (v#>>'{}') ~ app_enrichment_text_cntrl) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invalid Apps snapshot description'; END IF;
  IF k='priceTier' AND v<>'null'::jsonb AND (jsonb_typeof(v)<>'string' OR v#>>'{}' NOT IN ('Free','Freemium','Paid','Subscription')) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invalid Apps snapshot price'; END IF;
  IF k='platforms' THEN
   IF jsonb_typeof(v)<>'array' OR jsonb_array_length(v)>16 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invalid Apps snapshot platforms'; END IF;
   FOR platform IN SELECT value FROM jsonb_array_elements(v) LOOP
    IF jsonb_typeof(platform)<>'string' OR octet_length(platform#>>'{}') NOT BETWEEN 1 AND 100 OR (platform#>>'{}') ~ app_enrichment_trim_edge OR (platform#>>'{}') ~ app_enrichment_text_cntrl THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invalid Apps snapshot platform'; END IF;
   END LOOP;
  END IF;
  provenance=p->'fieldProvenance'->k;
  IF jsonb_typeof(provenance)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(provenance) e(key)) IS DISTINCT FROM ARRAY['observedAt','sourceUrl']::text[] OR jsonb_typeof(provenance->'observedAt')<>'string' OR jsonb_typeof(provenance->'sourceUrl')<>'string' OR octet_length(provenance->>'sourceUrl')>2048 OR provenance->>'sourceUrl' !~* '^(http://(\[[0-9a-f:.]+\]|[^:/?#@[:space:]]+)(:0*80)?|https://(\[[0-9a-f:.]+\]|[^:/?#@[:space:]]+)(:0*443)?)([/?#][^[:space:]]*)?$' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invalid Apps field provenance'; END IF;
   -- Same spelling-before-cast rule as the payload scalars, and the same reason: the cast alone
  -- accepted a space-separator, whitespace-padded or bare-offset instant the contract refuses.
  IF provenance->>'observedAt' !~ app_enrichment_instant
  OR NOT public.app_enrichment_safe_host(regexp_replace(regexp_replace(regexp_replace(lower(provenance->>'sourceUrl'),'^[^:]*://',''),'[/?#].*$',''),':[0-9]*$','')) THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invalid Apps field provenance';
  END IF;
  PERFORM (provenance->>'observedAt')::timestamptz;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER app_enrichment_snapshot_insert_guard BEFORE INSERT ON app_enrichment_snapshots FOR EACH ROW EXECUTE FUNCTION app_enrichment_snapshot_guard();
CREATE FUNCTION app_enrichment_entitlement_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.app_enrichment_generations g JOIN public.app_enrichment_snapshots s ON s.id=NEW.snapshot_id WHERE g.id=NEW.generation_id AND g.app_entity_id=s.app_entity_id AND ROW(g.source_id,g.source_identity,g.source_identity_hash,g.canonicalization_version)=ROW(s.source_id,s.source_identity,s.source_identity_hash,s.canonicalization_version)) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Apps entitlement source mismatch'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER app_enrichment_entitlement_source_guard BEFORE INSERT ON app_enrichment_entitlements FOR EACH ROW EXECUTE FUNCTION app_enrichment_entitlement_guard();
CREATE FUNCTION app_enrichment_acceptance_admission() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE state text; r public.recommendations%ROWTYPE; b public.app_enrichment_bindings%ROWTYPE;
BEGIN
 SELECT status INTO state FROM public.creator_accounts WHERE id=NEW.account_id FOR UPDATE;
 IF state IS DISTINCT FROM 'active' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Apps acceptance account unavailable'; END IF;
 PERFORM pg_advisory_xact_lock(44031,hashtext(NEW.account_id::text||':apps'));
 SELECT * INTO r FROM public.recommendations WHERE id=NEW.recommendation_id AND account_id=NEW.account_id FOR UPDATE;
 IF NOT FOUND OR r.category<>'apps' OR r.archived_at IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Apps acceptance recommendation unavailable'; END IF;
 SELECT * INTO b FROM public.app_enrichment_bindings WHERE recommendation_id=r.id AND account_id=NEW.account_id FOR UPDATE;
 IF NOT FOUND OR b.app_entity_id<>r.entity_id OR b.current_generation_id IS DISTINCT FROM NEW.generation_id OR EXISTS(SELECT 1 FROM public.app_enrichment_generation_retirements WHERE generation_id=NEW.generation_id) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Apps acceptance generation unavailable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER app_enrichment_acceptance_admission_guard BEFORE INSERT ON app_enrichment_acceptances FOR EACH ROW EXECUTE FUNCTION app_enrichment_acceptance_admission();
CREATE FUNCTION app_enrichment_acceptance_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE p jsonb; selected text[]; expected jsonb; receipt public.application_command_receipts%ROWTYPE;
 app_enrichment_uuid text='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
BEGIN
 SELECT payload INTO p FROM public.app_enrichment_snapshots WHERE id=NEW.snapshot_id;
 SELECT array_agg(field ORDER BY ord) INTO selected FROM unnest(ARRAY['title','description','priceTier','platforms']) WITH ORDINALITY e(field,ord) WHERE field=ANY(NEW.selected_fields);
 IF NEW.selected_fields IS DISTINCT FROM coalesce(selected,ARRAY[]::text[]) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Apps acceptance selection mismatch'; END IF;
 SELECT coalesce(jsonb_object_agg(key,value),'{}'::jsonb) INTO expected FROM jsonb_each(p->'fields') WHERE key=ANY(NEW.selected_fields);
 IF NEW.accepted_values IS DISTINCT FROM expected OR (SELECT count(*) FROM jsonb_object_keys(expected))<>cardinality(NEW.selected_fields) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Apps acceptance values mismatch'; END IF;
 SELECT * INTO receipt FROM public.application_command_receipts WHERE id=NEW.receipt_id;
 -- The four response identifiers below are compared through ::uuid, which accepts brace-wrapped
 -- and unhyphenated spellings that appAcceptanceResultSchema refuses on replay. Lower severity
 -- than the snapshot case (a receipt expires, and the application writes it from an already
 -- parsed result), but the same parity rule applies: pin the spelling, in its own statement.
 IF FOUND AND EXISTS(SELECT 1 FROM unnest(ARRAY['receiptId','recommendationId','snapshotId','bindingGenerationId']) e(field) WHERE coalesce(receipt.response->>field,'') !~ app_enrichment_uuid) THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Apps acceptance receipt mismatch';
 END IF;
 IF NOT FOUND OR receipt.account_id<>NEW.account_id OR receipt.operation<>'acceptAppEnrichment' OR receipt.status<>'completed' OR (receipt.response->>'receiptId')::uuid IS DISTINCT FROM NEW.receipt_id OR (receipt.response->>'recommendationId')::uuid IS DISTINCT FROM NEW.recommendation_id OR (receipt.response->>'snapshotId')::uuid IS DISTINCT FROM NEW.snapshot_id OR (receipt.response->>'bindingGenerationId')::uuid IS DISTINCT FROM NEW.generation_id OR receipt.response->'acceptedFields' IS DISTINCT FROM to_jsonb(NEW.selected_fields) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Apps acceptance receipt mismatch'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER app_enrichment_acceptance_receipt_guard AFTER INSERT ON app_enrichment_acceptances DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_enrichment_acceptance_guard();

REVOKE ALL ON app_enrichment_bindings,app_enrichment_generations,app_enrichment_generation_retirements,app_enrichment_snapshots,app_enrichment_entitlements,app_enrichment_acceptances FROM PUBLIC,music_runtime;
GRANT SELECT,INSERT ON app_enrichment_bindings TO music_runtime;
GRANT UPDATE(app_entity_id,opt_in,binding_revision,current_generation_id) ON app_enrichment_bindings TO music_runtime;
GRANT SELECT,INSERT ON app_enrichment_generations,app_enrichment_generation_retirements,app_enrichment_acceptances TO music_runtime;
GRANT SELECT ON app_enrichment_snapshots,app_enrichment_entitlements TO music_runtime;
REVOKE ALL ON FUNCTION app_enrichment_immutable_payload(),app_enrichment_binding_identity(),app_enrichment_current_generation_guard(),app_enrichment_canonical_json(jsonb),app_enrichment_safe_host(text),app_enrichment_snapshot_guard(),app_enrichment_entitlement_guard(),app_enrichment_acceptance_admission(),app_enrichment_acceptance_guard() FROM PUBLIC,music_runtime;

-- =====================================================================================
-- ROOT SHARED INTEGRATION. Serialized AFTER the storage author's section above; the
-- storage author owns everything before this banner and nothing below it.
--
-- Nothing below installs or implies a provider registry, source tuple, host allow-list,
-- credential, quota, TTL, retention job, schedule or taxonomy vocabulary. The Apps
-- provider/host/operating policy remains an UNSUPPLIED EXTERNAL INPUT, and the registry
-- stays empty by construction (the repository is constructed with no approved sources).
-- Snapshot insert authority is NOT granted to any runtime role here.
-- =====================================================================================

-- HANDOFF 4 RESOLUTION: binding_revision monotonicity.
-- app_enrichment_binding_identity() pinned id/account_id/recommendation_id/category/kind
-- but not binding_revision, and GRANT UPDATE(...,binding_revision,...) above makes the
-- column writable, so the revision was freely settable in BOTH directions. A2's
-- stale-observation fence (app_enrichment_entitlements.observed_binding_revision) is only
-- sound if the revision cannot move backwards, so the guard now REFUSES A DECREASE.
-- It deliberately does NOT require a strict increase: the lawful creation path inserts the
-- binding and then sets current_generation_id in a second UPDATE that leaves
-- binding_revision at 1, so a strict-increase guard would refuse a lawful write. Equality
-- is therefore admitted; only downward movement raises. The rest of this body is unchanged
-- from the definition above, restated because a trigger function body cannot be amended
-- in place.
CREATE OR REPLACE FUNCTION app_enrichment_binding_identity() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='UPDATE' AND ROW(NEW.id,NEW.account_id,NEW.recommendation_id,NEW.category,NEW.kind) IS DISTINCT FROM ROW(OLD.id,OLD.account_id,OLD.recommendation_id,OLD.category,OLD.kind) THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Immutable Apps binding identity';
 END IF;
 IF TG_OP='UPDATE' AND NEW.binding_revision<OLD.binding_revision THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Apps binding revision cannot regress';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.recommendations r JOIN public.entities e ON e.id=r.entity_id WHERE r.id=NEW.recommendation_id AND r.account_id=NEW.account_id AND r.category='apps' AND r.entity_id=NEW.app_entity_id AND e.kind='app' AND e.origin='manual') THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Apps binding identity mismatch';
 END IF;
 RETURN NEW;
END $$;

-- HANDOFF 5 RESOLUTION: the snapshot guard becomes SECURITY DEFINER.
-- app_enrichment_snapshot_guard() calls app_enrichment_canonical_json(jsonb) AND
-- app_enrichment_safe_host(text), whose EXECUTE is revoked from music_runtime above.
-- Nested EXECUTE is checked at call time against the INVOKER.
--
-- TENSE, STATED PRECISELY SO THE MOUNTING STAGE DOES NOT MISREAD IT: this marking is INERT
-- TODAY. This migration grants SELECT only on app_enrichment_snapshots (:315) and, as the
-- banner above says, grants snapshot INSERT authority to no runtime role at all, so no
-- music_runtime path reaches this guard yet and no 42501 is being fixed here. The marking is a
-- PRECONDITION for the first stage that grants INSERT on app_enrichment_snapshots to a runtime
-- role: without it, that stage's first INSERT would fail 42501 on every row on the nested
-- EXECUTE. Whoever adds that grant therefore owns the FIRST REAL EXERCISE of this path and must
-- author the 42501 evidence under music_runtime; it has never run under that role here, and no
-- test in this stage can claim it has. Two ways to make that later grant workable:
-- grant the role EXECUTE on both private functions, or make the guard SECURITY DEFINER.
-- DEFINER is chosen. Granting EXECUTE would hand the runtime role the canonical-hash
-- primitive itself -- the exact capability needed to manufacture a payload whose
-- contentHash satisfies the guard -- and would widen the role's function inventory beyond
-- anything this stage requires (the stage grants SELECT only on snapshots). DEFINER adds
-- no escalation surface in exchange: the function is a BEFORE INSERT trigger whose EXECUTE
-- stays revoked from music_runtime, so it cannot be invoked directly; it performs no DML
-- and no privileged action, only reads NEW and returns NEW or raises; its search_path is
-- pinned to pg_catalog,public and every call it makes is schema-qualified, so the definer's
-- privileges cannot be redirected. No role gains a privilege from this statement.
ALTER FUNCTION app_enrichment_snapshot_guard() SECURITY DEFINER;

-- FORWARD PURGE REPLACEMENT. Identical to the 0054 definition except for the Apps
-- enrichment block and the Apps receipt sanitization marked below: the taxonomy locks,
-- the account -> sorted category lock order, the pending_deletion authority fence, the
-- matching running terminal deletion fence, the analytics receipt retirement, the existing
-- deletion order and the retained collection/recommendation counter semantics are
-- unchanged. No 0001-0054 file is modified.
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

-- RECOMMENDATION REPLACEMENT RETIREMENT AND CURRENT-POINTER FENCE (stage 2, SQL side).
-- Replacing an Apps recommendation's entity previously left the binding pointing at the OLD
-- app entity with a live current generation, so the owner's suggestion list kept serving
-- snapshots for an app the recommendation no longer names. The binding identity guard already
-- refuses the NEXT binding write in that state, but nothing acted on the replacement itself.
--
-- This is authored in SQL, not in the recommendation repository, because the repository files
-- are owned by another allocation at this point in the sequence; a trigger also covers every
-- writer of recommendations.entity_id rather than one command path.
--
-- Policy, exactly as the shared allocation states it: retire the old generation, disable the
-- binding, advance the binding revision, advance the current entity and clear the current
-- pointer. History is retained: generation rows keep the OLD app entity and the retirement row
-- records that they are no longer live. Acceptances and entitlements are untouched, so an
-- accepted value's provenance survives a replacement. No new acceptance can be made until the
-- owner performs an explicit rebind, because the acceptance admission guard requires a
-- non-null current generation.
--
-- Ordering: the retirement INSERT and the pointer clear are both in this statement's
-- transaction, and app_enrichment_retired_current_guard is DEFERRABLE INITIALLY DEFERRED, so
-- it evaluates at commit when the pointer is already NULL. The pointer is cleared in the same
-- UPDATE that advances app_entity_id, so app_enrichment_binding_identity() sees
-- NEW.app_entity_id = the replacement entity and re-checks it against the recommendation.
--
-- CONSEQUENCE, deliberate and loud: that re-check requires the replacement entity to be
-- kind='app' AND origin='manual'. Replacing a bound Apps recommendation's entity with a
-- provider-origin or non-app entity therefore RAISES 23514 and refuses the replacement
-- instead of silently leaving an Apps binding attached to an entity no Apps path accepts.
CREATE FUNCTION app_enrichment_recommendation_replacement() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 INSERT INTO public.app_enrichment_generation_retirements(generation_id)
  SELECT b.current_generation_id FROM public.app_enrichment_bindings b
   WHERE b.recommendation_id=NEW.id AND b.account_id=NEW.account_id AND b.current_generation_id IS NOT NULL
  ON CONFLICT (generation_id) DO NOTHING;
 UPDATE public.app_enrichment_bindings
  SET current_generation_id=NULL,opt_in=false,binding_revision=binding_revision+1,app_entity_id=NEW.entity_id
  WHERE recommendation_id=NEW.id AND account_id=NEW.account_id;
 RETURN NULL;
END $$;
-- WHEN clause scope: OLD or NEW, not NEW alone -- defence-in-depth only, NOT the exit fence.
-- The exit fence is the composite foreign key at 0055:28; see the MEASURED correction further
-- down this comment before relying on the clause for anything. recommendations.category IS
-- MUTABLE, which is the background for both. 0029:40
-- declares it with a value CHECK and no immutability trigger; the only trigger 0029 installs on
-- the table is the deferred recommendation_entity_kind_guard (0029:102), which constrains the
-- category/entity-kind PAIR and not the category's stability; and 0029:138 grants music_runtime
-- table-level SELECT,INSERT,UPDATE on recommendations with no column list, so the runtime role
-- may write the column. The application layer never does: there is no `UPDATE recommendations
-- SET category` anywhere in tunes/server, tunes/shared or tunes/scripts, and
-- explorersRecommendationRepository.ts:510 sets entity_id alone. No guard forbids the statement
-- shape -- it is merely unused today, so the shape is reachable only out of band.
--
-- WHAT ELSE OBSERVES A CATEGORY TRANSITION ON THIS TABLE -- the real inventory, because an
-- earlier revision of this comment named 0029/0053 only and was WRONG. 0053:67's
-- NEW.category IS DISTINCT FROM OLD.category lives in lock_recommendation_taxonomy_catalog
-- (0053:62), installed at 0053:85 on recommendation_taxonomy -- a different table entirely.
-- Four LATER migrations install category-sensitive triggers on recommendations ITSELF:
--   0035:34  recommendation_book_cover_category_guard  AFTER UPDATE OF category
--   0037:250 movie_context_replacement_constraint      BEFORE UPDATE OF entity_id,category
--   0038:75  movie_media_recommendation_reverse_guard  AFTER UPDATE OF entity_id,category,account_id
--   0054:177 places_recommendation_cleanup             BEFORE UPDATE OR DELETE (its function
--            compares NEW.category/OLD.category at 0054:130-159)
-- plus three column-less AFTER UPDATE guards that therefore also see category moves:
--   0043:82 recommendations_app_screenshot_guard, 0046:106 recommendations_place_context_kind_guard,
--   0047:53 recommendations_place_photo_guard.
-- Anyone adding a recategorise command must reckon with ALL of these, not just this one.
--
-- PRECEDENT, and it is favourable. Refusing a category EXIT while a dependent row in that
-- category's side table exists is an ESTABLISHED class here, not an invention of 0055:
--   0035:21-22 book covers, 0037:246 movie context, 0043:69-70 app screenshots,
--   0046:99-102 place context kind, 0047:47 place photos.
-- 0055's binding is exactly such a dependent row. Most directly, 0043:69-70 ALREADY refuses an
-- Apps category exit for any recommendation holding an app screenshot, and its trigger (0043:82)
-- carries no column list. 0054 is the lone counter-pattern: its exit cleans up pins rather than
-- refusing.
--
-- WHAT ACTUALLY FENCES THE EXIT -- MEASURED, AND CORRECTING AN EARLIER CLAIM IN THIS COMMENT.
-- An earlier revision of this prose credited the widened WHEN clause below with fencing the
-- category exit (a 23514 from app_enrichment_binding_identity()). That was WRONG. The composite
-- foreign key at 0055:28, which pins app_enrichment_bindings.category (0055:23, CHECK category
-- ='apps') to recommendations(id,account_id,category), makes ANY category exit of a BOUND Apps
-- recommendation a REFERENCED-KEY violation. PostgreSQL's internal RI constraint triggers on
-- `recommendations` are named RI_ConstraintTrigger_a_... and sort BEFORE any user trigger named
-- app_enrichment_..., so an exit statement is refused as 23503 naming
-- app_enrichment_bindings_recommendation_id_account_id_categ_fkey, the whole statement is rolled
-- back with the row completely unchanged, and the widened WHEN clause is NEVER REACHED.
-- The FK fence is also STRICTLY BROADER than any trigger fence could be: measured, it refuses the
-- exit with an entity change, WITHOUT an entity change (the WHEN clause additionally requires
-- NEW.entity_id IS DISTINCT FROM OLD.entity_id, so no trigger could reach that shape at all), and
-- AFTER disableAppEnrichment, which leaves the binding row and its current_generation_id in place
-- (explorersAppEnrichmentRepository.ts:88-89; nothing in the repository ever DELETEs a binding --
-- the only DELETE on the table in tunes/server is the `WHERE false` grant probe at
-- db/music-runtime-role.ts:853). So the fence keys on binding EXISTENCE, not liveness, and a
-- binding with current_generation_id IS NULL is fenced too. An UNBOUND Apps recommendation has no
-- referencing row, so its exit is lawful; the column is not frozen.
-- The OLD.category='apps' disjunct below is therefore REDUNDANT FOR THE EXIT PATH. It is NOT
-- removed: it is retained as harmless defence-in-depth should the FK shape ever change (for
-- example if the pinned `category` column were dropped from the composite reference). Nothing
-- below this comment is altered by this correction.
-- FORWARD-LOOKING: any future recategorise path must DROP or RE-POINT the binding before moving
-- the category, or it will be refused 23503 on a recommendation whose owner disabled enrichment
-- long ago -- which will read as a spurious failure to whoever hits it.
CREATE TRIGGER app_enrichment_recommendation_replacement_guard AFTER UPDATE OF entity_id ON recommendations
 FOR EACH ROW WHEN ((OLD.category='apps' OR NEW.category='apps') AND NEW.entity_id IS DISTINCT FROM OLD.entity_id)
 EXECUTE FUNCTION app_enrichment_recommendation_replacement();
REVOKE ALL ON FUNCTION app_enrichment_recommendation_replacement() FROM PUBLIC,music_runtime;
