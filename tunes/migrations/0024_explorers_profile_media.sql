CREATE TABLE media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES creator_accounts(id) ON DELETE RESTRICT,
  purpose text NOT NULL CHECK (purpose IN ('profile','background','feed','collection','recommendation','guide','claim-evidence')),
  status text NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading','ready','pending_delete','deleted','failed')),
  mime_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size>=0),
  content_sha256 bytea CHECK (content_sha256 IS NULL OR octet_length(content_sha256)=32),
  original_filename text,
  width_px integer CHECK (width_px>0),
  height_px integer CHECK (height_px>0),
  alternative_text text,
  caption text,
  ready_at timestamptz,
  delete_requested_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,account_id),
  CHECK ((width_px IS NULL)=(height_px IS NULL)),
  CHECK (status <> 'ready' OR (ready_at IS NOT NULL AND content_sha256 IS NOT NULL)),
  CHECK (status <> 'deleted' OR deleted_at IS NOT NULL)
);
CREATE INDEX media_assets_account_status_id_idx ON media_assets(account_id,status,id);
CREATE INDEX media_assets_abandoned_idx ON media_assets(created_at,id) WHERE status IN ('uploading','failed');
CREATE INDEX media_assets_pending_delete_idx ON media_assets(delete_requested_at,id) WHERE status='pending_delete';

CREATE TABLE media_objects (
  media_id uuid NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
  variant text NOT NULL CHECK (variant IN ('original','thumbnail','display')),
  storage_environment text NOT NULL CHECK (storage_environment IN ('local','qa','prod')),
  object_key text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size>=0),
  content_sha256 bytea NOT NULL CHECK (octet_length(content_sha256)=32),
  storage_version_id text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(media_id,variant),
  CHECK (left(object_key,length(storage_environment)+1)=storage_environment||'/'),
  CHECK (object_key !~ '[[:cntrl:]]|(^|/)\.\.(/|$)')
);

CREATE TABLE profile_media (
  account_id uuid NOT NULL REFERENCES creator_accounts(id) ON DELETE CASCADE,
  slot text NOT NULL CHECK (slot IN ('profile','background','wallpaper')),
  media_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(account_id,slot),
  FOREIGN KEY(media_id,account_id) REFERENCES media_assets(id,account_id) ON DELETE RESTRICT
);
CREATE INDEX profile_media_media_id_idx ON profile_media(media_id);

CREATE TABLE profile_feed_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES creator_accounts(id) ON DELETE RESTRICT,
  media_id uuid,
  external_url text,
  source text NOT NULL CHECK (source IN ('manual','google','instagram')),
  media_type text NOT NULL CHECK (media_type IN ('image','video')),
  caption text,
  display_order integer NOT NULL CHECK (display_order>=0),
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(media_id,account_id) REFERENCES media_assets(id,account_id) ON DELETE RESTRICT,
  CONSTRAINT profile_feed_one_source CHECK ((media_id IS NULL) <> (external_url IS NULL)),
  CONSTRAINT profile_feed_manual_local CHECK (source <> 'manual' OR media_id IS NOT NULL),
  CONSTRAINT profile_feed_order_uq UNIQUE(account_id,display_order) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX profile_feed_account_id_idx ON profile_feed_items(account_id,id);

REVOKE ALL ON media_assets,media_objects,profile_media,profile_feed_items FROM PUBLIC,music_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON media_assets,media_objects,profile_media,profile_feed_items TO music_runtime;
