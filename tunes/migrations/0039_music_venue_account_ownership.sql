-- Canonical account ownership of the Music venue profile (ADR-007, accepted 2026-10-06).
-- A users row is a venue profile owned by exactly one creator account; it is not an
-- identity and nothing authenticates against it. A Google-only canonical account has
-- no password (password authentication is disabled outright) and no Strapi document
-- id, so the two constraints that assumed a Strapi-provisioned login are relaxed.
-- They are not relaxed into nothing: an ownership invariant replaces them, so every
-- venue row must be owned by either a legacy Strapi document id or a canonical
-- account mapping. The checks are deferred to commit, which lets one transaction
-- insert the venue row and its mapping in either order while still rejecting an
-- unowned row — the orphan a failed provisioning would otherwise leave behind.
-- This migration advances the schema chain only. It deliberately does not touch any
-- production deployment marker: those record what production is actually running and
-- move at deployment time under ticket 8.4's separate authority.
LOCK TABLE public.users IN EXCLUSIVE MODE;
LOCK TABLE public.account_music_identity IN SHARE ROW EXCLUSIVE MODE;

-- A canonical venue has no password to store and no login path that would read one.
ALTER TABLE public.users ALTER COLUMN password DROP NOT NULL;
-- Legacy-only from here. Neither is written by canonical provisioning. Both keep
-- their UNIQUE indexes, which continue to reject duplicate legacy ids, and Postgres
-- permits many NULLs in a unique index, so any number of canonically-owned venues
-- may coexist. Both are relaxed together because a canonical account has neither a
-- Strapi user nor a Strapi account document id; relaxing only the first would move
-- the same failure one column to the right.
ALTER TABLE public.users ALTER COLUMN strapi_user_document_id DROP NOT NULL;
ALTER TABLE public.users ALTER COLUMN strapi_account_document_id DROP NOT NULL;

CREATE FUNCTION public.assert_music_venue_owned() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.strapi_user_document_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.account_music_identity WHERE music_user_id = NEW.id) THEN
    RAISE EXCEPTION 'music venue profile % is unowned: expected a legacy Strapi document id or a canonical account mapping', NEW.id;
  END IF;
  RETURN NULL;
END $$;

CREATE FUNCTION public.assert_music_venue_owner_retained() RETURNS trigger LANGUAGE plpgsql AS $$
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
END $$;

-- Deferred so that provisioning may write the venue row and its mapping in one
-- transaction in either order; an unowned row is rejected at COMMIT.
CREATE CONSTRAINT TRIGGER users_music_venue_owned
  AFTER INSERT OR UPDATE OF strapi_user_document_id ON public.users
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.assert_music_venue_owned();

CREATE CONSTRAINT TRIGGER account_music_identity_owner_retained
  AFTER DELETE ON public.account_music_identity
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.assert_music_venue_owner_retained();

-- House style, and required by the restricted runtime role attestation: a new
-- function keeps PostgreSQL's default PUBLIC EXECUTE unless revoked, which widens
-- the privilege graph and fails verifyMusicRuntimeDatabaseConnection.
REVOKE ALL ON FUNCTION public.assert_music_venue_owned(),public.assert_music_venue_owner_retained() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_music_venue_owned(),public.assert_music_venue_owner_retained() TO music_runtime;
