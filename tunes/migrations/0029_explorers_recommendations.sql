-- Shared catalog identity and account-owned content. Historical migrations remain immutable.
CREATE TABLE entities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 kind text NOT NULL CHECK(kind IN ('place','movie','book','game','app','product','person')),
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 500),
 origin text NOT NULL CHECK(origin IN ('provider','manual')),
 facts_version smallint NOT NULL DEFAULT 1 CHECK(facts_version>0),
 search_document tsvector NOT NULL DEFAULT ''::tsvector,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,kind)
);
CREATE INDEX entities_search_idx ON entities USING gin(search_document);
CREATE INDEX entities_kind_idx ON entities(kind,id);
CREATE TABLE entity_identifiers (
 entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
 provider text NOT NULL CHECK(provider IN ('google_books','tmdb','igdb','google_places')),
 external_kind text NOT NULL CHECK(length(btrim(external_kind)) BETWEEN 1 AND 100),
 external_id text NOT NULL CHECK(length(btrim(external_id)) BETWEEN 1 AND 512 AND external_id=btrim(external_id)),
 fetched_at timestamptz NOT NULL DEFAULT now(), source_url text,
 PRIMARY KEY(provider,external_kind,external_id), UNIQUE(entity_id,provider,external_kind)
);
CREATE INDEX entity_identifiers_entity_idx ON entity_identifiers(entity_id);
CREATE TABLE collections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES creator_accounts(id) ON DELETE RESTRICT,
 category text NOT NULL CHECK(category IN ('places','guides','movies','books','games','apps','products','people')),
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 200), description text, description_rich jsonb,
 slug text NOT NULL CHECK(length(slug) BETWEEN 1 AND 200 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 visibility text NOT NULL DEFAULT 'private' CHECK(visibility IN ('private','public')),
 publication_state text NOT NULL DEFAULT 'draft' CHECK(publication_state IN ('draft','published')),
 display_order integer NOT NULL CHECK(display_order>=0), pin_order integer CHECK(pin_order>=0), heading text,
 revision bigint NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 9007199254740991), archived_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,category), UNIQUE(id,account_id), UNIQUE(id,account_id,category), UNIQUE(account_id,category,slug)
);
CREATE INDEX collections_account_order_idx ON collections(account_id,category,display_order,id) WHERE archived_at IS NULL;
CREATE INDEX collections_account_pin_idx ON collections(account_id,category,pin_order,id) WHERE archived_at IS NULL;
CREATE TABLE recommendations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES creator_accounts(id) ON DELETE RESTRICT,
 entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
 category text NOT NULL CHECK(category IN ('places','movies','books','games','apps','products','people')),
 note jsonb, user_rating smallint CHECK(user_rating BETWEEN 1 AND 10),
 publication_state text NOT NULL DEFAULT 'draft' CHECK(publication_state IN ('draft','published')),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 9007199254740991), archived_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,category), UNIQUE(id,account_id), UNIQUE(id,account_id,category)
);
CREATE INDEX recommendations_account_idx ON recommendations(account_id,category,created_at,id) WHERE archived_at IS NULL;
CREATE INDEX recommendations_entity_idx ON recommendations(entity_id,account_id) WHERE archived_at IS NULL;
CREATE TABLE collection_items (
 collection_id uuid NOT NULL, recommendation_id uuid NOT NULL, account_id uuid NOT NULL,
 category text NOT NULL CHECK(category IN ('places','movies','books','games','apps','products','people')),
 display_order integer NOT NULL CHECK(display_order>=0), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(collection_id,recommendation_id),
 FOREIGN KEY(collection_id,account_id,category) REFERENCES collections(id,account_id,category) ON DELETE CASCADE,
 FOREIGN KEY(recommendation_id,account_id,category) REFERENCES recommendations(id,account_id,category) ON DELETE RESTRICT,
 UNIQUE(collection_id,display_order) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX collection_items_recommendation_idx ON collection_items(recommendation_id);
CREATE TABLE account_category_pin_state (
 account_id uuid NOT NULL REFERENCES creator_accounts(id) ON DELETE CASCADE,
 category text NOT NULL CHECK(category IN ('books','movies','games','apps','products','people')),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 9007199254740991), PRIMARY KEY(account_id,category)
);
CREATE TABLE category_recommendation_pins (
 account_id uuid NOT NULL, category text NOT NULL, recommendation_id uuid NOT NULL, collection_id uuid NOT NULL,
 position integer NOT NULL CHECK(position>=0), PRIMARY KEY(account_id,category,recommendation_id),
 FOREIGN KEY(recommendation_id,account_id,category) REFERENCES recommendations(id,account_id,category) ON DELETE CASCADE,
 FOREIGN KEY(collection_id,account_id,category) REFERENCES collections(id,account_id,category) ON DELETE CASCADE,
 FOREIGN KEY(collection_id,recommendation_id) REFERENCES collection_items(collection_id,recommendation_id) ON DELETE CASCADE,
 FOREIGN KEY(account_id,category) REFERENCES account_category_pin_state(account_id,category) ON DELETE CASCADE
);
CREATE INDEX category_pins_order_idx ON category_recommendation_pins(account_id,category,position,recommendation_id);
CREATE INDEX category_pins_collection_idx ON category_recommendation_pins(collection_id,recommendation_id);
CREATE INDEX category_pins_recommendation_idx ON category_recommendation_pins(recommendation_id);
CREATE TABLE collection_media (
 collection_id uuid NOT NULL, account_id uuid NOT NULL, slot text NOT NULL CHECK(slot='cover'), media_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(collection_id,slot),
 FOREIGN KEY(collection_id,account_id) REFERENCES collections(id,account_id) ON DELETE CASCADE,
 FOREIGN KEY(media_id,account_id) REFERENCES media_assets(id,account_id) ON DELETE RESTRICT
);
CREATE INDEX collection_media_asset_idx ON collection_media(media_id);
CREATE TABLE recommendation_media (
 recommendation_id uuid NOT NULL, account_id uuid NOT NULL, media_id uuid NOT NULL,
 display_order integer NOT NULL CHECK(display_order>=0), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(recommendation_id,media_id),
 FOREIGN KEY(recommendation_id,account_id) REFERENCES recommendations(id,account_id) ON DELETE CASCADE,
 FOREIGN KEY(media_id,account_id) REFERENCES media_assets(id,account_id) ON DELETE RESTRICT,
 UNIQUE(recommendation_id,display_order) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX recommendation_media_asset_idx ON recommendation_media(media_id);

CREATE FUNCTION guard_recommendation_entity_kind() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM public.recommendations r JOIN public.entities e ON e.id=r.entity_id
   WHERE (CASE r.category WHEN 'places' THEN e.kind IN ('place','person') WHEN 'movies' THEN e.kind='movie'
    WHEN 'books' THEN e.kind='book' WHEN 'games' THEN e.kind='game' WHEN 'apps' THEN e.kind='app'
    WHEN 'products' THEN e.kind='product' WHEN 'people' THEN e.kind='person' ELSE false END)=false
   AND (CASE WHEN TG_TABLE_NAME='entities' THEN e.id=NEW.id ELSE r.id=NEW.id END))
 THEN RAISE EXCEPTION 'Recommendation entity kind mismatch' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER recommendation_entity_kind_guard AFTER INSERT OR UPDATE ON recommendations
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_recommendation_entity_kind();
CREATE CONSTRAINT TRIGGER entity_recommendation_kind_guard AFTER UPDATE ON entities
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_recommendation_entity_kind();

CREATE FUNCTION guard_recommendation_media() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE asset_status text; asset_purpose text;
BEGIN
 SELECT status,purpose INTO asset_status,asset_purpose FROM public.media_assets
   WHERE id=NEW.media_id AND account_id=NEW.account_id FOR SHARE;
 IF asset_status IS DISTINCT FROM 'ready' OR asset_purpose IS DISTINCT FROM
   (CASE WHEN TG_TABLE_NAME='collection_media' THEN 'collection' ELSE 'recommendation' END)
 THEN RAISE EXCEPTION 'Content requires ready owned purpose-compatible media' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER collection_media_ready_guard AFTER INSERT OR UPDATE ON collection_media
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_recommendation_media();
CREATE CONSTRAINT TRIGGER recommendation_media_ready_guard AFTER INSERT OR UPDATE ON recommendation_media
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_recommendation_media();
CREATE OR REPLACE FUNCTION explorers_assert_no_unready_references() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE current_status text;
BEGIN
 SELECT status INTO current_status FROM public.media_assets WHERE id=NEW.id;
 IF current_status <> 'ready' AND (
   EXISTS(SELECT 1 FROM public.profile_media WHERE media_id=NEW.id) OR
   EXISTS(SELECT 1 FROM public.profile_feed_items WHERE media_id=NEW.id) OR
   EXISTS(SELECT 1 FROM public.collection_media WHERE media_id=NEW.id) OR
   EXISTS(SELECT 1 FROM public.recommendation_media WHERE media_id=NEW.id))
 THEN RAISE EXCEPTION 'Referenced media must remain ready' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION guard_recommendation_entity_kind(),guard_recommendation_media() FROM PUBLIC;
REVOKE ALL ON entities,entity_identifiers,collections,recommendations,collection_items,account_category_pin_state,
 category_recommendation_pins,collection_media,recommendation_media FROM PUBLIC,music_runtime;
GRANT SELECT,INSERT,UPDATE ON entities TO music_runtime;
GRANT SELECT,INSERT ON entity_identifiers TO music_runtime;
GRANT SELECT,INSERT,UPDATE ON collections,recommendations,account_category_pin_state TO music_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON collection_items,category_recommendation_pins,collection_media,recommendation_media TO music_runtime;

-- Terminal maintenance alone may physically purge owned content. Generic runtime
-- writers retain archive-only rights; catalog rows and the account tombstone survive.
CREATE FUNCTION purge_explorers_account_content(target_account uuid,target_operation uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE current_status text; eligible boolean; removed_collections integer; removed_recommendations integer;
BEGIN
 SELECT status INTO current_status FROM public.creator_accounts WHERE id=target_account FOR UPDATE;
 IF current_status IS DISTINCT FROM 'pending_deletion' THEN
   RAISE EXCEPTION 'Terminal deletion authority required' USING ERRCODE='42501';
 END IF;
 SELECT true INTO eligible FROM public.account_lifecycle_operations o JOIN public.creator_accounts a ON a.id=o.account_id
   WHERE o.id=target_operation AND o.account_id=target_account AND o.kind='delete' AND o.state='running'
     AND a.deletion_requested_at<=clock_timestamp() FOR UPDATE OF o;
 IF eligible IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'Matching running terminal deletion required' USING ERRCODE='42501';
 END IF;
 DELETE FROM public.collections WHERE account_id=target_account;
 GET DIAGNOSTICS removed_collections=ROW_COUNT;
 DELETE FROM public.recommendations WHERE account_id=target_account;
 GET DIAGNOSTICS removed_recommendations=ROW_COUNT;
 DELETE FROM public.account_category_pin_state WHERE account_id=target_account;
 RETURN removed_collections+removed_recommendations;
END $$;
REVOKE ALL ON FUNCTION purge_explorers_account_content(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION purge_explorers_account_content(uuid,uuid) TO music_runtime;
