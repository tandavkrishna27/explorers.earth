-- C4 persists the authoritative provider as a mutable display/eligibility
-- snapshot. It is never an ownership key and may converge on later ensures.
ALTER TABLE users
  ADD COLUMN strapi_provider_snapshot text NOT NULL DEFAULT 'legacy-unknown',
  ADD CONSTRAINT users_strapi_provider_snapshot_check
    CHECK (strapi_provider_snapshot IN ('legacy-unknown','local','google'));

COMMENT ON COLUMN users.strapi_provider_snapshot IS
  'Mutable authoritative Strapi provider snapshot; never an identity lookup key';
