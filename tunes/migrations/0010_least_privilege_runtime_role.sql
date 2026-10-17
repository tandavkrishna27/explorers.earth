-- The application login inherits only this NOLOGIN capability role. Password
-- provisioning remains a bounded gate operation and is never stored in SQL.
DO $$
DECLARE runtime_role record;
BEGIN
  SELECT rolcanlogin, rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls
    INTO runtime_role FROM pg_roles WHERE rolname='music_runtime';
  IF NOT FOUND THEN
    CREATE ROLE music_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      INHERIT NOREPLICATION NOBYPASSRLS;
  ELSIF runtime_role.rolcanlogin OR runtime_role.rolsuper OR runtime_role.rolcreaterole
      OR runtime_role.rolcreatedb OR runtime_role.rolreplication OR runtime_role.rolbypassrls THEN
    RAISE EXCEPTION 'music_runtime capability role has unsafe attributes';
  END IF;
END;
$$;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM music_runtime;
GRANT USAGE ON SCHEMA public TO music_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO music_runtime;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO music_runtime;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO music_runtime;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON music_schema_migrations FROM music_runtime;
GRANT SELECT ON music_schema_migrations TO music_runtime;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON music_credential_revocation_operations FROM music_runtime;
GRANT SELECT, INSERT ON music_credential_revocation_operations TO music_runtime;

ALTER TABLE music_credential_revocation_operations
  ENABLE ALWAYS TRIGGER music_credential_revocation_history_immutability;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO music_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO music_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO music_runtime;

CREATE FUNCTION provision_music_runtime_login(p_login_role name, p_password text) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
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
$$;

REVOKE ALL ON FUNCTION provision_music_runtime_login(name,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION provision_music_runtime_login(name,text) FROM music_runtime;
