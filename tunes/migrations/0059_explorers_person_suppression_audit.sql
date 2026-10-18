-- People takedowns get an audited write path. Ticket P5-9.
--
-- 0045 added person_entity_details.suppressed_at and deliberately gave it no application
-- write path: a recommended person has no account, so removal is an operator action run
-- through the migrator role. What 0045 did not add is any record of that action, so a
-- takedown was a hand-written UPDATE that left no trace of who removed a person, when or
-- why. tunes/scripts/suppress-person.ts is the write path; this is its ledger.
--
-- One row per change of state, written in the same transaction as the UPDATE. A request
-- for the state the person is already in records nothing (the command is idempotent).
-- Append-only even for the owning migrator: an audit row an operator can edit is not an
-- audit. The runtime role gets nothing - it never reads or writes suppression. TRUNCATE is
-- deliberately not guarded: the disposable e2e fixture reset (music-e2e-state-restore.mjs)
-- truncates every table, and no runtime or operator path truncates.
CREATE TABLE public.person_suppression_actions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 entity_id uuid NOT NULL REFERENCES public.person_entity_details(entity_id) ON DELETE RESTRICT,
 action text NOT NULL CHECK(action IN ('suppress','restore')),
 reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 1000 AND length(btrim(reason))>0),
 operator text NOT NULL CHECK(length(operator) BETWEEN 1 AND 200 AND length(btrim(operator))>0 AND operator !~ '[[:cntrl:]]'),
 previous_suppressed_at timestamptz,
 resulting_suppressed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((action='suppress') = (resulting_suppressed_at IS NOT NULL)),
 CHECK((action='suppress') = (previous_suppressed_at IS NULL))
);
CREATE INDEX person_suppression_actions_entity_idx ON public.person_suppression_actions(entity_id,created_at,id);

CREATE FUNCTION public.refuse_person_suppression_audit_change() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 RAISE EXCEPTION 'Person suppression audit is append-only' USING ERRCODE='42501';
END $$;
CREATE TRIGGER person_suppression_actions_append_only BEFORE UPDATE OR DELETE ON public.person_suppression_actions
 FOR EACH ROW EXECUTE FUNCTION public.refuse_person_suppression_audit_change();

REVOKE ALL ON public.person_suppression_actions FROM PUBLIC,music_runtime;
REVOKE ALL ON FUNCTION public.refuse_person_suppression_audit_change() FROM PUBLIC,music_runtime;
