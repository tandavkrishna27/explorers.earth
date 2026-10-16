-- Freeze the user's revocation generation when Better Auth creates a web session.
ALTER TABLE auth_session ADD COLUMN session_version bigint NOT NULL DEFAULT 1
  CHECK (session_version BETWEEN 1 AND 9007199254740991);

CREATE FUNCTION stamp_explorers_session_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO user_security_state(user_id) VALUES (NEW.user_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT session_version INTO NEW.session_version FROM user_security_state WHERE user_id=NEW.user_id;
  RETURN NEW;
END $$;
CREATE TRIGGER auth_session_version_before_insert BEFORE INSERT ON auth_session
  FOR EACH ROW EXECUTE FUNCTION stamp_explorers_session_version();

-- Physical Music owner remains users until the 6.1 canonical Music migration.
CREATE TABLE account_music_identity (
  account_id uuid PRIMARY KEY REFERENCES creator_accounts(id) ON DELETE RESTRICT,
  music_user_id integer NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE CHECK (music_user_id>0),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);
CREATE FUNCTION reject_account_music_identity_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'canonical Music mapping is immutable';
END $$;
CREATE TRIGGER account_music_identity_immutable BEFORE UPDATE ON account_music_identity
  FOR EACH ROW EXECUTE FUNCTION reject_account_music_identity_mutation();

REVOKE ALL ON account_music_identity FROM PUBLIC,music_runtime;
GRANT SELECT,INSERT ON account_music_identity TO music_runtime;
REVOKE ALL ON FUNCTION stamp_explorers_session_version(),reject_account_music_identity_mutation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION stamp_explorers_session_version(),reject_account_music_identity_mutation() TO music_runtime;
