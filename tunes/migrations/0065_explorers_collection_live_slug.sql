-- OWN-01. A list's URL slug is unique only among the owner's LIVE lists in a category:
-- archiving "paris" frees "paris" for a new list. 0029 made it unique across archived
-- rows too, so an invisible archived list blocked the URL ("That URL is already used").
--
-- The full constraint guaranteed no live duplicates, so the check below cannot fire on
-- a database that reached 0064 through this chain. It stays as a loud guard for a
-- database repaired by hand: it names the offending rows instead of guessing which to keep.
-- Restoring an archived list whose slug a live list now uses fails on the new index
-- (23505 -> 409); the restore command (WP3B) turns that into "choose a new URL".
DO $$
DECLARE offenders text;
BEGIN
  SELECT string_agg(format('%s/%s/%s: %s', account_id, category, slug, ids), '; ')
    INTO offenders
    FROM (SELECT account_id, category, slug, string_agg(id::text, ',' ORDER BY id) AS ids
            FROM public.collections WHERE archived_at IS NULL
           GROUP BY account_id, category, slug HAVING count(*) > 1) AS duplicates;
  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION 'OWN-01: live lists share a slug; resolve these before migrating: %', offenders;
  END IF;
END $$;

ALTER TABLE public.collections DROP CONSTRAINT collections_account_id_category_slug_key;
CREATE UNIQUE INDEX collections_live_slug_uq ON public.collections(account_id,category,slug) WHERE archived_at IS NULL;
