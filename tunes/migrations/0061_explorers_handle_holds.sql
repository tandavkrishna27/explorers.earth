-- A handle can change once per HANDLE_CHANGE_COOLDOWN_DAYS (30), and the handle an account
-- leaves is held for the same window so nobody else can claim it and old links can follow
-- the account to its new handle.
--
-- One row per held handle. handle_key is the lower-cased handle, the same normalisation as
-- creator_accounts.handle_key; it is the primary key because a handle is held by at most one
-- account at a time (a later holder replaces an expired row). account_id is who it was
-- released by and who may take it back.
--
-- The row also is the record of the account's last handle change: created_at is when it
-- happened, so the next change is allowed from created_at + 30 days. No separate column on
-- the hot creator_accounts table is needed, and an expired row keeps saying "changed N days
-- ago" until the cooldown is over, which is exactly as long as it matters.
--
-- Read and written by the account update (inside its row-locked transaction) and by the
-- public profile read, which only follows a hold whose holder still has a public handle.
-- Rows are deleted with the account's content when it is deleted.
CREATE TABLE public.account_handle_holds (
 handle_key text PRIMARY KEY CHECK(handle_key=lower(handle_key) AND handle_key ~ '^[a-z][a-z0-9-]{2,29}$'),
 account_id uuid NOT NULL REFERENCES public.creator_accounts(id) ON DELETE CASCADE,
 held_until timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(held_until>created_at)
);
CREATE INDEX account_handle_holds_account_idx ON public.account_handle_holds(account_id,created_at DESC);

GRANT SELECT,INSERT,UPDATE,DELETE ON public.account_handle_holds TO music_runtime;
