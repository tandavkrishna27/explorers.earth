-- The two launch controls decided on 2026-10-08: email suppression (D2) and the monthly
-- guest song request cap (D1).
--
-- They share one migration deliberately. Adding a migration to this repository moves a
-- schema floor that is named in roughly twenty places - the migration contract, five
-- compose files, the CI workflow, two env examples, the deploy engine, the runtime table
-- manifest and the deployment tests - and each of those is a place a partial edit produces
-- a confusing failure rather than an obvious one. Two tables decided on the same day by the
-- same owner, neither referencing the other, are not worth paying that coordination twice.
--
-- ============================================================================
-- email_suppressions - the addresses that must not be contacted. Decision D2.
-- ============================================================================
--
-- Why a table keyed on the address rather than a flag on an account:
--
-- A suppression is a fact about an ADDRESS, not about an account. All three ways one
-- arrives carry an address and nothing else - a provider bounce, a spam complaint, and an
-- unsubscribe click from a mail client that has no session - and an address that never had
-- an account can still land on the list. A boolean on `users` or `creator_accounts` would
-- silently fail to honour every one of those.
--
-- `revised-direction.md` authorised migrating zero rows from the legacy `unsubscribe`
-- collection. Zero rows is not no table: the first unsubscribe after launch has to be
-- honoured, and that legacy type carried the only `unique:true` in the entire Strapi
-- schema, which says the uniqueness was the point of it.
--
-- Three rules are storage rather than application checks:
--
--  - **One row per address.** The unique index is on the normalised address, so two
--    spellings of one mailbox cannot disagree about whether it is suppressed. Unsubscribing
--    is therefore idempotent by construction: the route inserts ON CONFLICT DO NOTHING and
--    a second click is a no-op instead of a duplicate.
--  - **The stored address IS the normalised one.** `CHECK(email = lower(btrim(email)))`
--    stops a caller writing a mixed-case address that the send-time lookup would never
--    match. This check is what makes the unique index mean anything; without it the index
--    only enforces uniqueness of spelling.
--  - **A reason is always recorded.** "They asked" and "the provider reported a hard
--    bounce" permit different things later. A list that cannot tell them apart cannot be
--    audited, and cannot be cleaned up without guessing.
--
-- No UPDATE grant: a suppression has nothing to amend. Its identity is the address and its
-- content is the reason it happened; a different reason is a different event.
--
-- No DELETE grant, deliberately. Removing an address from a do-not-contact list is the one
-- operation here that can cause mail to reach somebody who asked for none, so it does not
-- get to be a side effect of ordinary code. Re-subscribing, if it ever becomes a product,
-- needs its own reviewed path and its own grant.
--
-- On deletion this table RETAINS, which is why the runtime manifest classifies it
-- `retain-policy` and not `strip-on-deletion`. If deleting an account removed its
-- suppression, deleting an account would un-suppress the address - so the one action most
-- likely to follow "stop emailing me" would quietly undo it.

LOCK TABLE public.creator_accounts IN EXCLUSIVE MODE;
LOCK TABLE public.users IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE public.email_suppressions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 email text NOT NULL CHECK(email = lower(btrim(email)))
   CHECK(length(email) BETWEEN 3 AND 320)
   CHECK(position('@' IN email) > 1)
   CHECK(position('@' IN email) < length(email)),
 reason text NOT NULL CHECK(reason IN ('unsubscribe','bounce','complaint','manual')),
 -- Free-text provenance: which surface or provider event produced the row. Bounded so a
 -- webhook body cannot be smuggled in wholesale.
 source text CHECK(source IS NULL OR length(source) BETWEEN 1 AND 200),
 suppressed_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX email_suppressions_email_uq ON public.email_suppressions(email);

REVOKE ALL ON public.email_suppressions FROM PUBLIC,music_runtime;
GRANT SELECT,INSERT ON public.email_suppressions TO music_runtime;

-- ============================================================================
-- music_request_quota - the monthly guest song request cap. Decision D1.
-- ============================================================================
--
-- TK set the cap at 100 accepted guest requests per venue per calendar month, with the
-- surface labelled beta. This is an abuse and cost control, not a billing surface: every
-- accepted request is a YouTube Data API call, so without a durable ceiling the launch has
-- no bound on third-party spend.
--
-- Why this needs its own table, measured rather than assumed. Two existing tables look like
-- they already count this and neither can:
--
--  - `music_owner_operations` holds one row per accepted request, but with
--    `expires_at = +24 hours`, and `addGuestSongIdempotent` actively sweeps expired rows on
--    every call. It is an idempotency ledger with a one-day horizon, so counting it gives a
--    daily figure at best.
--  - `songs` holds the queue, which churns as tracks are played and removed, so its count
--    answers "how long is the queue" and not "how many were requested this month".
--
-- The in-transaction `recentForSource >= 20` check beside this one is a per-minute burst
-- limiter keyed on the requesting source, which is a different control: it stops one client
-- flooding, and says nothing about a venue's monthly total.
--
-- The period is a calendar month in UTC, stored as the month's first day. A date rather
-- than a timestamp because the key must land in exactly one bucket however it is computed,
-- and `date_trunc('month', …)::date` is the only expression that writes it.
--
-- Counting is an upsert that returns the post-increment total, and the caller rolls back
-- when that total exceeds the cap - so the increment and the queue insert commit together
-- or not at all. A refused request therefore does not consume quota, which it would under a
-- check-then-increment pair.
--
-- UPDATE is granted here, unlike email_suppressions, because the count is exactly the kind
-- of field that gets amended: that is what incrementing is.
--
-- Rows CASCADE with the Music owner. A counter for a venue that no longer exists bounds
-- nothing, so the manifest classifies it `delete-with-music-owner`.

CREATE TABLE public.music_request_quota (
 music_user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 period_start date NOT NULL CHECK(period_start = date_trunc('month', period_start)::date),
 accepted_count integer NOT NULL DEFAULT 0 CHECK(accepted_count >= 0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(music_user_id, period_start)
);

REVOKE ALL ON public.music_request_quota FROM PUBLIC,music_runtime;
GRANT SELECT,INSERT,UPDATE ON public.music_request_quota TO music_runtime;

-- No DELETE grant. Expiring old periods is a retention job with its own authority, and a
-- runtime that can delete a period can also reset a venue's month to zero.
