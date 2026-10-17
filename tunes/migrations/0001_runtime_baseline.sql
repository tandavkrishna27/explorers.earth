CREATE TABLE team_members (
  id serial PRIMARY KEY,
  name text NOT NULL,
  role text NOT NULL,
  regions text[] NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id serial PRIMARY KEY,
  username text NOT NULL UNIQUE,
  password text NOT NULL,
  email text UNIQUE,
  otp text,
  otp_expiry timestamp,
  email_verification_token text,
  email_verification_expiry timestamp,
  is_email_verified boolean DEFAULT false,
  guest_url text NOT NULL UNIQUE,
  venue_name text NOT NULL,
  theme jsonb NOT NULL DEFAULT '{"primary":"#6E56CF"}'::jsonb,
  allow_song_requests boolean NOT NULL DEFAULT true,
  allow_guest_play_on_device boolean NOT NULL DEFAULT true,
  allow_playlist_sharing boolean NOT NULL DEFAULT false,
  allow_recently_played_visibility boolean NOT NULL DEFAULT true,
  account_manager_id integer REFERENCES team_members(id),
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE playlists (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_visible_to_guests boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE songs (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  youtube_id text NOT NULL,
  title text NOT NULL,
  artist text NOT NULL,
  thumbnail_url text NOT NULL,
  position integer NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','playing','played')),
  played_at timestamp
);

CREATE TABLE played_songs (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  song_id integer NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  played_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE playlist_songs (
  id serial PRIMARY KEY,
  playlist_id integer NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  youtube_id text NOT NULL,
  title text NOT NULL,
  artist text NOT NULL,
  thumbnail_url text NOT NULL,
  position integer NOT NULL,
  added_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE guest_interactions (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  guest_id text NOT NULL,
  page_view boolean DEFAULT true,
  song_request boolean DEFAULT false,
  interaction_type text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  session_duration integer
);

CREATE TABLE youtube_api_usage (
  id serial PRIMARY KEY,
  endpoint_type text NOT NULL,
  user_id integer REFERENCES users(id) ON DELETE SET NULL,
  quota_cost integer NOT NULL DEFAULT 0 CHECK (quota_cost >= 0),
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE user_sessions (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_time timestamp NOT NULL,
  end_time timestamp,
  last_active_at timestamp,
  device_info jsonb,
  ip_address text,
  country_code text,
  region text,
  geo_data jsonb,
  CHECK (end_time IS NULL OR end_time >= start_time)
);

CREATE TABLE activity_logs (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_data jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE analytics_snapshots (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  snapshot_date timestamp NOT NULL,
  total_views integer NOT NULL,
  total_song_requests integer NOT NULL,
  average_session_duration integer,
  total_playlists_created integer NOT NULL,
  total_songs_played integer NOT NULL,
  additional_metrics jsonb
);

CREATE TABLE user_activity (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  path text NOT NULL,
  method text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "session" (
  sid text PRIMARY KEY,
  sess jsonb NOT NULL,
  expire timestamp NOT NULL
);
CREATE INDEX idx_session_expire ON "session"(expire);

CREATE TABLE api_tokens (
  id serial PRIMARY KEY,
  token text NOT NULL UNIQUE,
  name text NOT NULL,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  description text,
  scopes text[] NOT NULL DEFAULT '{}',
  is_app_wide boolean NOT NULL DEFAULT false,
  expires_at timestamp,
  expires_in_days integer,
  created_at timestamp NOT NULL DEFAULT now(),
  last_used_at timestamp,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE user_profiles (
  id serial PRIMARY KEY,
  user_id integer NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  first_name text,
  last_name text,
  profile_picture text,
  country_code text,
  phone_number text,
  street_name text,
  state text,
  city text,
  country text,
  postal_code text,
  instagram_url text,
  facebook_url text,
  youtube_url text,
  twitter_url text,
  whatsapp_url text,
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE email_templates (
  id serial PRIMARY KEY,
  name text NOT NULL,
  subject text NOT NULL,
  html_content text NOT NULL,
  text_content text NOT NULL,
  variables jsonb NOT NULL DEFAULT '{}',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  created_by integer REFERENCES users(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE email_logs (
  id serial PRIMARY KEY,
  recipient text NOT NULL,
  subject text NOT NULL,
  template_id integer REFERENCES email_templates(id) ON DELETE SET NULL,
  status text NOT NULL,
  error_message text,
  created_at timestamp NOT NULL DEFAULT now(),
  delivered_at timestamp,
  api_token_id integer REFERENCES api_tokens(id) ON DELETE SET NULL,
  message_id text,
  metadata jsonb DEFAULT '{}',
  is_test boolean DEFAULT false,
  variables text
);

CREATE TABLE page_contents (
  id serial PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  content text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  created_by integer REFERENCES users(id) ON DELETE SET NULL,
  updated_by integer REFERENCES users(id) ON DELETE SET NULL,
  is_published boolean NOT NULL DEFAULT true
);

CREATE TABLE seo_settings (
  id serial PRIMARY KEY,
  site_title text NOT NULL,
  meta_description text NOT NULL,
  meta_keywords text NOT NULL,
  og_title text NOT NULL,
  og_description text NOT NULL,
  og_image text NOT NULL,
  twitter_title text NOT NULL,
  twitter_description text NOT NULL,
  twitter_image text NOT NULL,
  google_analytics_id text,
  facebook_pixel_id text,
  google_tag_manager_id text,
  microsoft_clarity_id text,
  robots_txt text NOT NULL,
  sitemap_xml text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamp NOT NULL DEFAULT now(),
  updated_by integer REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE system_settings (
  id serial PRIMARY KEY,
  key text NOT NULL UNIQUE,
  value text NOT NULL,
  description text,
  is_secret boolean NOT NULL DEFAULT false,
  category text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  updated_by integer REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE youtube_music_playlists (id serial PRIMARY KEY, user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE, external_id text, payload jsonb NOT NULL DEFAULT '{}', created_at timestamp NOT NULL DEFAULT now());
CREATE TABLE youtube_music (id serial PRIMARY KEY, user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE, external_id text, payload jsonb NOT NULL DEFAULT '{}', created_at timestamp NOT NULL DEFAULT now());
CREATE TABLE youtube_tokens (id serial PRIMARY KEY, user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE, token_ciphertext text, revoked_at timestamp, created_at timestamp NOT NULL DEFAULT now());
CREATE TABLE youtube_playlists (id serial PRIMARY KEY, user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE, external_id text, payload jsonb NOT NULL DEFAULT '{}', created_at timestamp NOT NULL DEFAULT now());
CREATE TABLE widgets (id serial PRIMARY KEY, user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind text NOT NULL DEFAULT 'legacy', configuration jsonb NOT NULL DEFAULT '{}', created_at timestamp NOT NULL DEFAULT now());
CREATE TABLE youtube_api_calls (id serial PRIMARY KEY, user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE, endpoint text NOT NULL DEFAULT 'unknown', quota_cost integer NOT NULL DEFAULT 0, created_at timestamp NOT NULL DEFAULT now());
CREATE TABLE playback_states (id serial PRIMARY KEY, user_id integer NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE, state jsonb NOT NULL DEFAULT '{}', updated_at timestamp NOT NULL DEFAULT now());

CREATE INDEX idx_playlists_user ON playlists(user_id);
CREATE INDEX idx_songs_user_status_position ON songs(user_id, status, position);
CREATE INDEX idx_played_songs_user_played ON played_songs(user_id, played_at);
CREATE INDEX idx_playlist_songs_playlist_position ON playlist_songs(playlist_id, position);
CREATE INDEX idx_guest_interactions_user_created ON guest_interactions(user_id, created_at);
CREATE INDEX idx_youtube_api_usage_user_created ON youtube_api_usage(user_id, created_at);
CREATE INDEX idx_user_sessions_user_active ON user_sessions(user_id, last_active_at);
CREATE INDEX idx_activity_logs_user_created ON activity_logs(user_id, created_at);
CREATE INDEX idx_analytics_snapshots_user_date ON analytics_snapshots(user_id, snapshot_date);
CREATE INDEX idx_user_activity_user_created ON user_activity(user_id, created_at);
