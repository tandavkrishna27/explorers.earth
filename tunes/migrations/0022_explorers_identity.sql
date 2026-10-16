-- Better Auth 1.7.6 / Drizzle 0.45.2 generated core contract.
-- The four auth tables mirror docs/replatform-audit/auth-qualification/generated-core.sql.
CREATE TABLE auth_user (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL,
  email_verified boolean NOT NULL DEFAULT false,
  image text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT auth_user_email_unique UNIQUE(email)
);
CREATE TABLE auth_session (
  id text PRIMARY KEY,
  expires_at timestamp NOT NULL,
  token text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL,
  ip_address text,
  user_agent text,
  user_id text NOT NULL,
  CONSTRAINT auth_session_token_unique UNIQUE(token),
  CONSTRAINT auth_session_user_id_auth_user_id_fk FOREIGN KEY(user_id) REFERENCES auth_user(id) ON DELETE CASCADE
);
CREATE INDEX "auth_session_userId_idx" ON auth_session(user_id);
CREATE TABLE auth_account (
  id text PRIMARY KEY,
  account_id text NOT NULL,
  provider_id text NOT NULL,
  user_id text NOT NULL,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamp,
  refresh_token_expires_at timestamp,
  scope text,
  password text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL,
  CONSTRAINT auth_account_user_id_auth_user_id_fk FOREIGN KEY(user_id) REFERENCES auth_user(id) ON DELETE CASCADE
);
CREATE INDEX "auth_account_userId_idx" ON auth_account(user_id);
CREATE UNIQUE INDEX auth_account_provider_subject_uq ON auth_account(provider_id,account_id);
CREATE TABLE auth_verification (
  id text PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  expires_at timestamp NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX "auth_verification_identifier_idx" ON auth_verification(identifier);

CREATE TABLE user_security_state (
  user_id text PRIMARY KEY REFERENCES auth_user(id) ON DELETE RESTRICT,
  session_version bigint NOT NULL DEFAULT 1 CHECK (session_version BETWEEN 1 AND 9007199254740991),
  blocked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE creator_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handle text,
  handle_key text GENERATED ALWAYS AS (lower(handle)) STORED,
  display_name text,
  account_type text,
  onboarding_status text NOT NULL DEFAULT 'incomplete',
  status text NOT NULL DEFAULT 'active',
  public_profile boolean NOT NULL DEFAULT true,
  auto_pinning boolean NOT NULL DEFAULT true,
  locale text NOT NULL DEFAULT 'en',
  mobile_number text,
  mobile_number_visible boolean NOT NULL DEFAULT false,
  bio_plain text,
  bio_rich jsonb,
  primary_address jsonb,
  additional_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  public_address jsonb,
  profile_place_details jsonb,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 9007199254740991),
  suspended_at timestamptz,
  deletion_requested_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT creator_accounts_handle_valid CHECK (handle IS NULL OR
    (handle ~ '^[a-z][a-z0-9-]{2,29}$' AND handle !~ '--' AND right(handle,1) <> '-')),
  CONSTRAINT creator_accounts_display_name_valid CHECK (display_name IS NULL OR
    (length(btrim(display_name)) BETWEEN 1 AND 200 AND display_name=btrim(display_name))),
  CONSTRAINT creator_accounts_type_valid CHECK (account_type IS NULL OR account_type IN ('Personal','Creator','Business')),
  CONSTRAINT creator_accounts_onboarding_valid CHECK (onboarding_status IN ('incomplete','complete')),
  CONSTRAINT creator_accounts_status_valid CHECK (status IN ('active','suspended','pending_deletion','deleted')),
  CONSTRAINT creator_accounts_complete_valid CHECK (onboarding_status <> 'complete' OR
    (handle IS NOT NULL AND display_name IS NOT NULL AND account_type IS NOT NULL)),
  CONSTRAINT creator_accounts_deleted_valid CHECK ((status='deleted') = (deleted_at IS NOT NULL)),
  CONSTRAINT creator_accounts_pending_valid CHECK (status <> 'pending_deletion' OR deletion_requested_at IS NOT NULL),
  CONSTRAINT creator_accounts_suspended_valid CHECK (status <> 'suspended' OR suspended_at IS NOT NULL),
  CONSTRAINT creator_accounts_addresses_valid CHECK (jsonb_typeof(additional_addresses)='array')
);
CREATE UNIQUE INDEX creator_accounts_handle_key_uq ON creator_accounts(handle_key);
CREATE INDEX creator_accounts_status_id_idx ON creator_accounts(status,id);
CREATE INDEX creator_accounts_created_id_idx ON creator_accounts(created_at,id);

CREATE TABLE account_memberships (
  account_id uuid NOT NULL REFERENCES creator_accounts(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES auth_user(id) ON DELETE RESTRICT,
  role text NOT NULL DEFAULT 'owner' CHECK (role='owner'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(account_id,user_id)
);
CREATE INDEX account_memberships_user_account_idx ON account_memberships(user_id,account_id);
CREATE TABLE initial_account_bindings (
  user_id text PRIMARY KEY REFERENCES auth_user(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL UNIQUE REFERENCES creator_accounts(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT initial_account_membership_fk FOREIGN KEY(account_id,user_id)
    REFERENCES account_memberships(account_id,user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE account_category_settings (
  account_id uuid NOT NULL REFERENCES creator_accounts(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('places','guides','music','movies','books','games','apps','products','people')),
  is_public boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL CHECK (display_order>=0),
  pinned_order integer CHECK (pinned_order>=0),
  PRIMARY KEY(account_id,category),
  CONSTRAINT account_category_display_order_uq UNIQUE(account_id,display_order) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT account_category_pinned_order_uq UNIQUE(account_id,pinned_order) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE account_presentation (
  account_id uuid PRIMARY KEY REFERENCES creator_accounts(id) ON DELETE CASCADE,
  schema_version smallint NOT NULL DEFAULT 1 CHECK (schema_version=1),
  theme_settings jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(theme_settings)='object'),
  social_links jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(social_links)='array'),
  business_details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(business_details)='object')
);

-- Recovery proof is a 2.1 prerequisite for ticket 2.4's server-only qualification.
CREATE TABLE account_recovery_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES auth_user(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES creator_accounts(id) ON DELETE RESTRICT,
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash)=32),
  purpose text NOT NULL DEFAULT 'account-recovery' CHECK (purpose='account-recovery'),
  authenticated_at timestamptz NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz,
  CONSTRAINT account_recovery_five_minute_check CHECK (expires_at=issued_at+interval '5 minutes'),
  CONSTRAINT account_recovery_membership_fk FOREIGN KEY(account_id,user_id)
    REFERENCES account_memberships(account_id,user_id) ON DELETE RESTRICT
);
CREATE INDEX account_recovery_expiry_idx ON account_recovery_proofs(expires_at,id);
CREATE INDEX account_recovery_account_user_idx ON account_recovery_proofs(account_id,user_id);

-- Existing 0010 default privileges otherwise expose every later table broadly.
REVOKE ALL ON auth_user,auth_session,auth_account,auth_verification,user_security_state,
  creator_accounts,account_memberships,initial_account_bindings,account_category_settings,
  account_presentation,account_recovery_proofs FROM PUBLIC,music_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON auth_user,auth_session,auth_account,auth_verification,
  creator_accounts,account_memberships,account_category_settings,account_presentation TO music_runtime;
GRANT SELECT,INSERT,UPDATE ON user_security_state,initial_account_bindings,account_recovery_proofs TO music_runtime;
