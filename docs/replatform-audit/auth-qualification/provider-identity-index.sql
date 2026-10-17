-- Application-owned addition; not emitted by Better Auth generator.
CREATE UNIQUE INDEX auth_account_provider_subject_uq ON auth_account(provider_id,account_id);
