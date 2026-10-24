-- LP-09. When an owner renames a list's URL slug, the old slug keeps working: public
-- reads match the current slug OR a slug the list was renamed from. One row per
-- (account, category, old slug). The repository keeps it unambiguous: a new list may
-- not take a slug that is still a redirect of another LIVE list, and renaming a list
-- onto a slug removes that slug's redirect. The UI for renaming is WP3B.
--
-- The foreign key uses collections' UNIQUE(id,account_id,category) (0029:33), so a
-- redirect can never point across accounts or categories. CASCADE covers a permanently
-- deleted list (R10, below) and the account-deletion strip.
-- No trigger; the e2e fixture reset truncates every table.
CREATE TABLE public.collection_slug_redirects (
 account_id uuid NOT NULL,
 category text NOT NULL,
 old_slug text NOT NULL CHECK(length(old_slug) BETWEEN 1 AND 200 AND old_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 collection_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(account_id,category,old_slug),
 FOREIGN KEY(collection_id,account_id,category) REFERENCES public.collections(id,account_id,category) ON DELETE CASCADE
);
CREATE INDEX collection_slug_redirects_collection_idx ON public.collection_slug_redirects(collection_id);

GRANT SELECT,INSERT,UPDATE,DELETE ON public.collection_slug_redirects TO music_runtime;

-- R10. A permanently deleted list keeps the account's analytics: the event loses only its
-- link to the list (SET NULL on collection_id alone; account_id/category stay, so 0036's
-- CHECK still holds). CASCADE would erase view history the owner's totals count.
-- Referential actions run as the table owner, so the runtime role gains no UPDATE here.
ALTER TABLE public.analytics_events DROP CONSTRAINT analytics_events_collection_id_account_id_category_fkey;
ALTER TABLE public.analytics_events ADD CONSTRAINT analytics_events_collection_id_account_id_category_fkey
 FOREIGN KEY(collection_id,account_id,category) REFERENCES public.collections(id,account_id,category) ON DELETE SET NULL (collection_id);

-- WP3B "Delete" runs as the runtime role. Every dependent of a list CASCADEs or is now
-- SET NULL; recommendations and entities keep refusing DELETE.
GRANT DELETE ON public.collections TO music_runtime;
